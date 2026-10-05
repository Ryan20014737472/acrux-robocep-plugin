import { loadConfig } from '../dist/config.js';
import { TABLES } from '../dist/catalog.js';
import { PublicSource } from '../dist/public-source.js';

const config = loadConfig();
if (!config.supabase) {
  console.error('Configure somente URL e chave publishable públicas para executar a auditoria.');
  process.exitCode = 1;
} else {
  const source = new PublicSource(config);
  const results = await Promise.all(Object.keys(TABLES).map(table => source.read(table)));
  console.log(JSON.stringify(results.map(({ table, status, items, source_url, source_checked_at, truncated }) =>
    ({ table, status, published_count: items.length, source_url, source_checked_at, truncated })), null, 2));
  if (results.some(result => ['unavailable', 'partial'].includes(result.status))) process.exitCode = 1;
}
