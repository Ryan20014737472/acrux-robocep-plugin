import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, AUDITED_SUPABASE_URL } from '../dist/config.js';
import { publicKey } from './fixtures.mjs';

test('defaults: PORT, HOST e origens exatas', () => {
  const config = loadConfig({});
  assert.equal(config.port, 3000);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.supabase, undefined);
  assert.ok(config.allowedHosts.includes('127.0.0.1:3000'));
});
test('Render usa PORT hospedada e hostname externo sem confiar em forwarded headers', () => {
  const config = loadConfig({ PORT: '10000', RENDER_EXTERNAL_URL: 'https://fixture.onrender.com', ALLOWED_HOSTS: 'custom.example.com' });
  assert.equal(config.port, 10000);
  assert.ok(config.allowedHosts.includes('fixture.onrender.com'));
  assert.ok(config.allowedHosts.includes('custom.example.com'));
});
for (const port of ['0', '-1', '65536', '2.5', 'nan']) test(`PORT inválida ${port}`, () => assert.throws(() => loadConfig({ PORT: port })));
for (const name of ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN']) {
  test(`${name} é rejeitada sem revelar valor`, () => {
    assert.throws(() => loadConfig({ [name]: 'SECRET_SENTINEL' }), error => !error.message.includes('SECRET_SENTINEL'));
  });
}
for (const key of [['sb','secret','sentinel'].join('_'), 'service_role', 'eyJ.test.jwt']) test('chave administrativa sob nome público é recusada', () => {
  assert.throws(() => loadConfig({ NEXT_PUBLIC_SUPABASE_URL: AUDITED_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }));
});
test('configuração pública precisa das duas variáveis', () => {
  assert.throws(() => loadConfig({ NEXT_PUBLIC_SUPABASE_URL: AUDITED_SUPABASE_URL }));
  assert.throws(() => loadConfig({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey }));
});
for (const url of ['https://evil.test', `${AUDITED_SUPABASE_URL}/rest/v1`, 'http://gxzpaocmgllycssxlena.supabase.co',
  'https://user:password@gxzpaocmgllycssxlena.supabase.co']) test(`origem não auditada é recusada ${url}`, () => {
  assert.throws(() => loadConfig({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey }));
});
for (const host of ['*', 'evil.test/path', 'user@host.test', 'host.test?x', 'https://host.test']) test(`Host inseguro na configuração ${host}`, () => assert.throws(() => loadConfig({ ALLOWED_HOSTS: host })));
for (const origin of ['*', 'null', 'https://chatgpt.com/', 'https://chatgpt.com/path', 'javascript:alert(1)', 'https://user@chatgpt.com']) {
  test(`Origin insegura na configuração ${origin}`, () => assert.throws(() => loadConfig({ ALLOWED_ORIGINS: origin })));
}
