export const SITE_URL = 'https://ryan20014737472.github.io/Blog-acrux-/';
export const AUDITED_SUPABASE_URL = 'https://gxzpaocmgllycssxlena.supabase.co';

export interface Config {
  host: string;
  port: number;
  allowedHosts: string[];
  allowedOrigins: string[];
  supabase?: { url: string; publishableKey: string };
}

function origin(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || url.origin !== value) {
    throw new Error('Origem inválida na configuração.');
  }
  return value;
}

function authority(value: string): string {
  const url = new URL(`http://${value}`);
  if (url.host !== value || url.username || url.password || url.pathname !== '/' ||
      url.search || url.hash || value.includes('*')) {
    throw new Error('Host inválido na configuração.');
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Reject privileged configuration without ever reading, logging or using its value.
  for (const name of ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN']) {
    if (env[name] !== undefined) throw new Error('Configuração administrativa proibida.');
  }
  const portText = env.PORT ?? '3000';
  if (!/^\d+$/.test(portText)) throw new Error('PORT inválida.');
  const port = Number(portText);
  if (port < 1 || port > 65535) throw new Error('PORT inválida.');
  const allowedHosts = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
  if (env.RENDER_EXTERNAL_URL) {
    const external = new URL(env.RENDER_EXTERNAL_URL);
    if (external.protocol !== 'https:' || external.username || external.password ||
        external.pathname !== '/' || external.search || external.hash) {
      throw new Error('URL externa inválida.');
    }
    allowedHosts.push(external.host);
  }
  if (env.ALLOWED_HOSTS) allowedHosts.push(...env.ALLOWED_HOSTS.split(',').map(s => authority(s.trim())));
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? 'https://chatgpt.com,https://chat.openai.com')
    .split(',').map(s => origin(s.trim()));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (Boolean(url) !== Boolean(publishableKey)) throw new Error('Configure as duas variáveis públicas do Supabase.');
  if (url && url.replace(/\/$/, '') !== AUDITED_SUPABASE_URL) {
    throw new Error('A origem Supabase deve corresponder ao projeto público auditado.');
  }
  // No JWTs, service-role or secret keys are accepted, even under a public variable name.
  if (publishableKey && !/^sb_publishable_[A-Za-z0-9_-]{10,256}$/.test(publishableKey)) {
    throw new Error('Somente chave publishable pública é aceita.');
  }
  const host = env.HOST ?? '0.0.0.0';
  if (!['0.0.0.0', '127.0.0.1', '::1'].includes(host)) throw new Error('HOST inválido.');
  return { host, port, allowedHosts: [...new Set(allowedHosts)], allowedOrigins,
    ...(url && publishableKey ? { supabase: { url: AUDITED_SUPABASE_URL, publishableKey } } : {}) };
}
