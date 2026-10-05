import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from '../dist/http.js';
import { PublicSource } from '../dist/public-source.js';
import { TOOL_DEFINITIONS } from '../dist/tools.js';
import { config, clock, mockFetch, publicKey } from './fixtures.mjs';

let server, base, client;
const outgoing = [];
before(async () => {
  const httpConfig = { ...config, allowedHosts: [...config.allowedHosts] };
  server = createHttpServer(httpConfig, new PublicSource(config, mockFetch(undefined, (url, options) => outgoing.push({ url, options })), clock));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  httpConfig.allowedHosts.push(`127.0.0.1:${port}`);
  base = `http://127.0.0.1:${port}`;
  client = new Client({ name: 'acrux-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});
after(async () => {
  await client?.close();
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
});
const post = (payload, headers = {}) => fetch(`${base}/mcp`, { method: 'POST', headers: {
  'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
  body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
const rawStatus = headers => new Promise((resolve, reject) => {
  const req = request(`${base}/health`, { headers }, res => {
    res.resume(); res.on('end', () => resolve(res.statusCode));
  });
  req.on('error', reject); req.end();
});

test('health: exatamente status ok e sem informações extras', async () => {
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"status":"ok"}');
});
test('tools/list: 10 ferramentas, schemas e annotations', async () => {
  const response = await client.listTools();
  assert.equal(response.tools.length, 10);
  assert.deepEqual(response.tools.map(t => t.name).sort(), TOOL_DEFINITIONS.map(t => t.name).sort());
  for (const tool of response.tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.idempotentHint, true);
    assert.equal(tool.annotations.openWorldHint, true);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
});
for (const tool of TOOL_DEFINITIONS) test(`MCP tools/call: ${tool.name}`, async () => {
  const response = await client.callTool({ name: tool.name, arguments: tool.name === 'search_acrux' ? { query: 'robótica' } : {} });
  assert.ok(!response.isError);
  assert.ok(response.structuredContent.items.length > 0);
  assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent);
  assert.ok(!JSON.stringify(response).includes(publicKey));
});
for (const tool of TOOL_DEFINITIONS) test(`MCP rejeita argumentos inválidos: ${tool.name}`, async () => {
  try {
    const response = await client.callTool({ name: tool.name, arguments: { limit: -1, query: 42, extra: 'INPUT_SENTINEL' } });
    assert.equal(response.isError, true);
    assert.ok(!JSON.stringify(response).includes('INPUT_SENTINEL'));
  } catch (error) {
    assert.ok(!String(error).includes('INPUT_SENTINEL'));
    assert.match(String(error), /invalid|validation|argument/i);
  }
});
test('MCP legado: initialize e tools/list funcionam sem sessão', async () => {
  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'legacy-test', version: '1' } } });
  assert.equal(init.status, 200);
  assert.equal(init.headers.get('mcp-session-id'), null);
  const initialized = await init.json();
  assert.equal(initialized.result.serverInfo.name, 'acrux-robocep');
  const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, { 'MCP-Protocol-Version': '2025-11-25' });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).result.tools.length, 10);
});
test('Host não permitido é bloqueado inclusive no health', async () => {
  // Node fetch rewrites Host; node:http sends the actual adversarial header.
  assert.equal(await rawStatus({ Host: 'evil.test' }), 403);
});
test('Host spoofing por forwarded headers não passa', async () => {
  assert.equal(await rawStatus({ Host: 'evil.test', 'X-Forwarded-Host': new URL(base).host }), 403);
});
test('Host duplicado é bloqueado', async () => {
  const response = await new Promise((resolve, reject) => {
    const req = request(`${base}/health`, { headers: ['Host', new URL(base).host, 'Host', 'evil.test'] }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end();
  });
  assert.equal(response, 403);
});
for (const origin of ['https://evil.test', 'https://chatgpt.com.evil.test', 'http://chatgpt.com', 'https://chatgpt.com:444', 'null', 'invalid']) {
  test(`Origin proibida: ${origin}`, async () => assert.equal((await post({}, { Origin: origin })).status, 403));
}
test('Origin aprovada e preflight com CORS exato', async () => {
  const response = await fetch(`${base}/mcp`, { method: 'OPTIONS', headers: { Origin: 'https://chatgpt.com' } });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://chatgpt.com');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
});
test('sem Origin permite clientes servidor a servidor', async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
});
test('Authorization de entrada nunca é repassado ao Supabase', async () => {
  outgoing.length = 0;
  const response = await post({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'get_team_info', arguments: {} } },
    { Authorization: 'Bearer ADMIN_INPUT_SENTINEL', 'MCP-Protocol-Version': '2025-11-25' });
  assert.equal(response.status, 200);
  assert.ok(outgoing.length > 0);
  assert.ok(outgoing.every(({ options }) => options.headers.apikey === publicKey && !options.headers.Authorization));
  assert.ok(!JSON.stringify(await response.json()).includes('ADMIN_INPUT_SENTINEL'));
});
test('JSON inválido não retorna stack trace', async () => {
  const response = await post('{');
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Corpo inválido ou excessivo.' });
});
test('corpo acima de 64 KiB é rejeitado', async () => {
  assert.equal((await post(JSON.stringify({ query: 'x'.repeat(70000) }))).status, 413);
});
test('Content-Type incorreto é rejeitado', async () => assert.equal((await post('{}', { 'Content-Type': 'text/plain' })).status, 415));
test('Accept MCP obrigatório é validado pelo SDK', async () => {
  assert.equal((await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { Accept: 'text/html' })).status, 406);
});
test('endpoint inexistente é 404', async () => assert.equal((await fetch(`${base}/admin`)).status, 404));
test('método PUT é 405', async () => assert.equal((await fetch(`${base}/mcp`, { method: 'PUT' })).status, 405));
test('DELETE sem sessão suportada é 405', async () => assert.equal((await fetch(`${base}/mcp`, { method: 'DELETE' })).status, 405));
test('GET MCP sem stream suportado é 405', async () => assert.equal((await fetch(`${base}/mcp`, { headers: { Accept: 'text/event-stream' } })).status, 405));
test('protocolo não suportado é recusado', async () => {
  assert.equal((await post({ jsonrpc: '2.0', id: 5, method: 'tools/list' }, { 'MCP-Protocol-Version': '1900-01-01' })).status, 400);
});
