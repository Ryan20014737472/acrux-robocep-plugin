import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTool, TOOL_DEFINITIONS } from '../dist/tools.js';
import { PublicSource } from '../dist/public-source.js';
import { rows, config, clock, mockFetch } from './fixtures.mjs';

const source = () => new PublicSource(config, mockFetch(), clock);
const call = async (name, args = {}, dataSource = source()) => (await executeTool(name, args, dataSource)).structuredContent;
for (const tool of TOOL_DEFINITIONS) {
  test(`${tool.name}: argumentos válidos e resposta pública`, async () => {
    const data = await call(tool.name, tool.name === 'search_acrux' ? { query: 'robótica' } : {});
    assert.ok(data.items.length > 0);
    assert.ok(data.items.every(item => item.status === 'published' && item.source_url && item.source_checked_at));
  });
  test(`${tool.name}: argumento desconhecido é inválido`, async () => {
    const response = await executeTool(tool.name, { query: 'robótica', secret: 'UNTRUSTED_SENTINEL' }, source());
    assert.equal(response.isError, true);
    assert.ok(!JSON.stringify(response).includes('UNTRUSTED_SENTINEL'));
  });
}
test('overview: fallback mínimo não inventa missão, pessoas ou conquistas', async () => {
  const data = await call('get_team_overview', {}, new PublicSource({ ...config, supabase: undefined }, mockFetch(), clock));
  assert.equal(data.status, 'partial');
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].name, 'ACRUX ROBOCEP');
  assert.equal(data.items[0].source_type, 'versioned_public_site_identity');
  assert.equal(data.items[0].mission, undefined);
});
test('temporada publicada não gera competição, resultado ou conquista', async () => {
  const s = new PublicSource(config, mockFetch({ seasons: rows.seasons }), clock);
  const data = await call('get_competitions', {}, s);
  assert.equal(data.items.length, 1);
  assert.equal(data.sources.find(source => source.table === 'competitions').status, 'empty');
  assert.equal(data.items[0].result, undefined);
  assert.deepEqual((await call('get_achievements', {}, s)).items, []);
});
for (const query of ['AÇÃO', 'acao', 'robótica', 'ROBOTICA', 'programacao', 'conexao']) test(`busca em português: ${query}`, async () => {
  const data = await call('search_acrux', { query });
  assert.ok(data.items.length > 0);
  assert.ok(data.items.every(item => item.source_url));
});
test('busca exige todos os termos relevantes e ignora palavras funcionais', async () => {
  const data = await call('search_acrux', { query: 'ação de robótica' });
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].id, 'post-1');
  assert.deepEqual((await call('search_acrux', { query: 'robótica inexistente' })).items, []);
});
test('busca evita substring no meio da palavra e IDs', async () => {
  assert.deepEqual((await call('search_acrux', { query: 'grama' })).items, []);
  assert.deepEqual((await call('search_acrux', { query: 'member' })).items, []);
});
test('busca sem resultados é explícita', async () => {
  const data = await call('search_acrux', { query: 'xilofone' });
  assert.equal(data.status, 'empty');
  assert.match(data.message, /Nenhum resultado público publicado/);
});
test('busca limitada retorna fonte e indicação truncada', async () => {
  const data = await call('search_acrux', { query: 'teste', limit: 1 });
  assert.equal(data.items.length, 1);
  assert.equal(data.truncated, true);
});
test('busca cobre todas as 10 tabelas públicas auditadas', async () => {
  const called = new Set();
  await call('search_acrux', { query: 'teste' }, new PublicSource(config, mockFetch(rows, url => called.add(url.pathname.split('/').at(-1))), clock));
  assert.deepEqual([...called].sort(), Object.keys(rows).sort());
  assert.ok(!called.has('profiles') && !called.has('media_assets'));
});
test('busca não apresenta dado não publicado de nenhuma categoria', async () => {
  const data = Object.fromEntries(Object.entries(rows).map(([table, items]) => [table, items.map(row => ({ ...row,
    title: 'PRIVATE_SENTINEL', name: 'PRIVATE_SENTINEL', status: 'draft', is_published: false }))]));
  const response = await call('search_acrux', { query: 'PRIVATE_SENTINEL' }, new PublicSource(config, mockFetch(data), clock));
  assert.deepEqual(response.items, []);
  assert.ok(!JSON.stringify(response).includes('PRIVATE_SENTINEL'));
});
test('fonte bloqueada deixa busca explicitamente incompleta', async () => {
  const response = await call('search_acrux', { query: 'teste' }, new PublicSource(config, async input =>
    new URL(input).pathname.endsWith('/robots') ? new Response('PRIVATE_ERROR', { status: 403 }) : mockFetch()(input), clock));
  assert.equal(response.status, 'partial');
  assert.ok(response.sources.some(s => s.table === 'robots' && s.status === 'unavailable'));
});
for (const query of ['', ' ', '!', 'a', 'x'.repeat(201), 42, null]) test(`search_acrux: entrada inválida ${String(query).slice(0,20)}`, async () => {
  assert.equal((await executeTool('search_acrux', { query }, source())).isError, true);
});
test('search_acrux: query obrigatória', async () => {
  assert.equal((await executeTool('search_acrux', {}, source())).isError, true);
});
for (const limit of [0, -1, 51, 1.5, '2', null]) for (const name of ['get_blog_posts', 'search_acrux']) {
  test(`${name}: limit inválido ${limit}`, async () => {
    assert.equal((await executeTool(name, { limit, ...(name === 'search_acrux' ? { query: 'teste' } : {}) }, source())).isError, true);
  });
}
for (const category of ['EDUCAÇÃO', 'educacao', 'Educação']) test(`blog: categoria ${category}`, async () => {
  assert.equal((await call('get_blog_posts', { category, limit: 1 })).items.length, 1);
});
test('blog: filtro sem resultados', async () => {
  const data = await call('get_blog_posts', { category: 'desconhecida' });
  assert.equal(data.status, 'empty');
  assert.deepEqual(data.items, []);
});
for (const category of ['', ' ', 3, null, 'x'.repeat(101)]) test(`blog: categoria inválida ${String(category).slice(0,20)}`, async () => {
  assert.equal((await executeTool('get_blog_posts', { category }, source())).isError, true);
});
test('ferramenta desconhecida não expõe detalhes', async () => {
  const response = await executeTool('PRIVATE_SENTINEL', {}, source());
  assert.equal(response.isError, true);
  assert.ok(!JSON.stringify(response).includes('PRIVATE_SENTINEL'));
});
