import { TABLES, columnsFor, type Table, type PublicItem, type SourceResult } from './catalog.js';
import { SITE_URL, type Config } from './config.js';

const PAGE_SIZE = 100;
const MAX_ROWS = 1000;
const MAX_BYTES = 2_000_000;

export function redact(value: unknown, key = ''): unknown {
  if (/secret|token|password|authorization|apikey|api_key|service_role|profile_id|author_id|uploaded_by|^admin$/i.test(key)) return undefined;
  if (typeof value === 'string') return value
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[chave removida]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token removido]')
    .replace(/(?:SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)\s*[:=]\s*[^\s,;]+/gi, '[credencial removida]');
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([name, child]) => [name, redact(child, name)]).filter(([, child]) => child !== undefined));
  return value;
}

async function boundedJson(response: Response): Promise<{ data: unknown; bytes: number }> {
  if (!response.body) throw new Error('Fonte indisponível.');
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) {
    await response.body.cancel(); throw new Error('Resposta excessiva.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Resposta excessiva.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return { data: JSON.parse(Buffer.concat(chunks).toString('utf8')), bytes: size };
}

export class PublicSource {
  constructor(private config: Config, private fetcher: typeof fetch = fetch,
    private clock: () => Date = () => new Date()) {}

  async read(table: Table): Promise<SourceResult> {
    const def = TABLES[table];
    const checkedAt = this.clock().toISOString();
    const source = { source_url: new URL(def.route, SITE_URL).href,
      source_type: 'supabase_public_site', source_checked_at: checkedAt };
    const result = (status: SourceResult['status'], message: string, items: PublicItem[] = [], truncated = false): SourceResult =>
      ({ table, status, message, items, ...source, truncated });
    if (!this.config.supabase) return result('unavailable', 'Acesso público Supabase não configurado.');
    const items: PublicItem[] = [];
    let invalid = false;
    let finished = false;
    let bytes = 0;
    // One deadline for the entire table, including pagination and body reads.
    const signal = AbortSignal.timeout(8000);
    try {
      for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
        const url = new URL(`/rest/v1/${table}`, this.config.supabase.url);
        url.searchParams.set('select', columnsFor(table));
        url.searchParams.set('order', def.order);
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('limit', String(PAGE_SIZE));
        if (table === 'posts') {
          url.searchParams.set('status', 'eq.published');
          url.searchParams.set('published_at', `lte.${checkedAt}`);
        } else url.searchParams.set('is_published', 'eq.true');
        const response = await this.fetcher(url, { method: 'GET', redirect: 'error',
          headers: { apikey: this.config.supabase.publishableKey, Accept: 'application/json' },
          signal });
        if (!response.ok) { await response.body?.cancel(); return result('unavailable', 'Fonte pública indisponível ou leitura não permitida pela RLS.'); }
        const page = await boundedJson(response);
        bytes += page.bytes;
        if (bytes > MAX_BYTES) return result('partial', 'Limite de dados públicos consultados atingido.', items, true);
        const rows = page.data;
        if (!Array.isArray(rows) || rows.length > PAGE_SIZE) throw new Error('Formato inválido.');
        for (const row of rows) {
          // Defense in depth: never trust filters/RLS alone, or a conflicting future status field.
          if (!row || typeof row !== 'object' ||
              ('status' in row && row.status !== 'published') ||
              ('is_published' in row && row.is_published !== true)) continue;
          const parsed = def.schema.safeParse(row);
          if (!parsed.success) { invalid = true; continue; }
          const data: Record<string, unknown> = parsed.data;
          if (table === 'posts' && (!Number.isFinite(Date.parse(String(data.published_at))) ||
              Date.parse(String(data.published_at)) > Date.parse(checkedAt))) continue;
          // Boolean publication is a source contract, never an inference about a draft/planned item.
          if (table !== 'posts' && data.is_published !== true) continue;
          const { is_published: _flag, post_categories: _relations, ...publicData } = data;
          if (table === 'posts') publicData.categories = (data.post_categories as { categories: { name: string; slug: string } | null }[])
            .flatMap(r => r.categories ? [r.categories] : []);
          // Only real detail pages receive a slug; gallery/seasons are listing pages.
          const detail = ['team_members', 'robots', 'projects', 'competitions', 'posts'].includes(table);
          const sourceUrl = detail && typeof data.slug === 'string' ?
            new URL(`${def.route}${encodeURIComponent(data.slug)}/`, SITE_URL).href : source.source_url;
          if (table === 'sponsors' && typeof publicData.website_url === 'string') {
            try {
              const sponsorUrl = new URL(publicData.website_url);
              if (sponsorUrl.protocol !== 'https:' || sponsorUrl.username || sponsorUrl.password) publicData.website_url = null;
            } catch { publicData.website_url = null; }
          }
          items.push(redact({ ...publicData, status: 'published', ...source, source_url: sourceUrl }) as PublicItem);
        }
        if (rows.length < PAGE_SIZE) { finished = true; break; }
      }
    } catch {
      // Fail closed on network, timeout, JSON and unexpected upstream errors. Never return error bodies.
      return result('unavailable', 'Não foi possível verificar a fonte pública.');
    }
    if (!finished || invalid) return result('partial', 'Consulta limitada ou conteúdo com formato incompatível omitido.', items, !finished);
    return items.length ? result('available', 'Somente conteúdo público publicado.', items) :
      result('empty', `Nenhum conteúdo público publicado de ${def.label} disponível.`);
  }
}
