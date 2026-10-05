import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLES, columnsFor } from '../dist/catalog.js';
import { PublicSource } from '../dist/public-source.js';
import { loadConfig, SITE_URL } from '../dist/config.js';
import { rows, config, clock, NOW, publicKey, mockFetch } from './fixtures.mjs';

for (const table of Object.keys(TABLES)) {
  test(`${table}: consultas GET anônimas, projeção e proveniência`, async () => {
    let requests = 0;
    const source = new PublicSource(config, mockFetch(rows, (url, options) => {
      requests++;
      assert.equal(url.hostname, 'gxzpaocmgllycssxlena.supabase.co');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.apikey, publicKey);
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.redirect, 'error');
      assert.equal(url.searchParams.get('select'), columnsFor(table));
      assert.ok(!url.searchParams.get('select').includes('*'));
      assert.ok(!/author_id|profile_id|storage_path|cover_path|uploaded_by/.test(columnsFor(table)));
      assert.equal(url.searchParams.get(table === 'posts' ? 'status' : 'is_published'), table === 'posts' ? 'eq.published' : 'eq.true');
      if (table === 'posts') assert.equal(url.searchParams.get('published_at'), `lte.${NOW}`);
    }), clock);
    const data = await source.read(table);
    assert.equal(data.status, 'available');
    assert.equal(data.items.length, 1);
    assert.equal(requests, 1);
    assert.equal(data.items[0].status, 'published');
    assert.equal(data.items[0].source_checked_at, NOW);
    assert.equal(data.items[0].source_type, 'supabase_public_site');
    assert.ok(data.items[0].source_url.startsWith(SITE_URL));
  });
  test(`${table}: conteúdo não publicado nunca aparece`, async () => {
    const privateRow = { ...rows[table][0], id: 'PRIVATE_SENTINEL', is_published: false, status: 'draft' };
    const data = await new PublicSource(config, mockFetch({ [table]: [privateRow] }), clock).read(table);
    assert.equal(data.items.length, 0);
    assert.ok(!JSON.stringify(data).includes('PRIVATE_SENTINEL'));
  });
  for (const state of ['draft', 'planned', 'archived']) test(`${table}: ${state} conflitante com publicação é excluído`, async () => {
    const row = { ...rows[table][0], status: state, is_published: true };
    assert.deepEqual((await new PublicSource(config, mockFetch({ [table]: [row] }), clock).read(table)).items, []);
  });
  test(`${table}: ausência é explícita`, async () => {
    const data = await new PublicSource(config, mockFetch({}), clock).read(table);
    assert.equal(data.status, 'empty');
    assert.match(data.message, /Nenhum conteúdo público publicado/);
    assert.deepEqual(data.items, []);
  });
  test(`${table}: dados administrativos extras são eliminados`, async () => {
    const row = { ...rows[table][0], profile_id: 'ADMIN_SENTINEL', author_id: 'ADMIN_SENTINEL',
      uploaded_by: 'ADMIN_SENTINEL', private_notes: 'ADMIN_SENTINEL', email: 'ADMIN_SENTINEL',
      media_assets: [{ storage_path: 'ADMIN_SENTINEL' }], storage_path: 'ADMIN_SENTINEL', role: 'admin' };
    const data = await new PublicSource(config, mockFetch({ [table]: [row] }), clock).read(table);
    assert.equal(data.items.length, 1);
    assert.ok(!JSON.stringify(data).includes('ADMIN_SENTINEL'));
    assert.ok(!JSON.stringify(data).includes('"role":"admin"'));
  });
}

for (const date of [null, 'invalid', '2027-01-01T00:00:00Z']) test(`posts: data ${date} não é publicação atual`, async () => {
  const data = await new PublicSource(config, mockFetch({ posts: [{ ...rows.posts[0], published_at: date }] }), clock).read('posts');
  assert.deepEqual(data.items, []);
});
test('posts: exatamente agora é publicado', async () => {
  assert.equal((await new PublicSource(config, mockFetch({ posts: [{ ...rows.posts[0], published_at: NOW }] }), clock).read('posts')).items.length, 1);
});
test('sem credenciais públicas: indisponível e nenhuma requisição', async () => {
  const data = await new PublicSource(loadConfig({}), () => assert.fail('Sem chamada de rede'), clock).read('team_members');
  assert.equal(data.status, 'unavailable');
});
for (const status of [401, 403, 404, 500]) test(`erro ${status} da fonte não vaza seu corpo`, async () => {
  const data = await new PublicSource(config, async () => new Response('SECRET_SENTINEL stack trace', { status }), clock).read('achievements');
  assert.equal(data.status, 'unavailable');
  assert.deepEqual(data.items, []);
  assert.ok(!JSON.stringify(data).includes('SECRET_SENTINEL'));
});
test('timeout e erro de rede não retornam stack, env ou chaves', async () => {
  const data = await new PublicSource(config, async () => { throw new Error(`STACK_SENTINEL ${publicKey}`); }, clock).read('posts');
  assert.equal(data.status, 'unavailable');
  assert.ok(!JSON.stringify(data).includes('SENTINEL'));
  assert.ok(!JSON.stringify(data).includes(publicKey));
});
for (const value of ['not json', '{}', 'null']) test(`formato inválido da fonte: ${value}`, async () => {
  const data = await new PublicSource(config, async () => new Response(value), clock).read('sponsors');
  assert.equal(data.status, 'unavailable');
  assert.deepEqual(data.items, []);
});
test('resposta excessiva é rejeitada', async () => {
  const data = await new PublicSource(config, async () => new Response('[]', { headers: { 'Content-Length': '2000001' } }), clock).read('posts');
  assert.equal(data.status, 'unavailable');
});
test('formato incompleto falha fechado com aviso partial', async () => {
  const data = await new PublicSource(config, mockFetch({ team_members: [{ id: 'unknown', name: 'Não confirmar', is_published: true }] }), clock).read('team_members');
  assert.equal(data.status, 'partial');
  assert.deepEqual(data.items, []);
});
test('paginação e limite de 1000 registros são explícitos', async () => {
  const many = Array.from({ length: 1001 }, (_, i) => ({ ...rows.team_members[0], id: `member-${i}` }));
  const offsets = [];
  const data = await new PublicSource(config, mockFetch({ team_members: many }, url => offsets.push(Number(url.searchParams.get('offset')))), clock).read('team_members');
  assert.equal(data.items.length, 1000);
  assert.equal(data.status, 'partial');
  assert.equal(data.truncated, true);
  assert.deepEqual(offsets, [0,100,200,300,400,500,600,700,800,900]);
});
test('erro numa página posterior descarta resultados parciais não verificados', async () => {
  const data = await new PublicSource(config, async url => new URL(url).searchParams.get('offset') === '0' ?
    Response.json(Array.from({ length: 100 }, (_, i) => ({ ...rows.sponsors[0], id: String(i) }))) : new Response('private', { status: 403 }), clock).read('sponsors');
  assert.equal(data.status, 'unavailable');
  assert.deepEqual(data.items, []);
});
test('galeria nunca retorna metadados de arquivos ou bucket privado', async () => {
  const data = await new PublicSource(config, mockFetch({ galleries: [{ ...rows.galleries[0], storage_bucket: 'private',
    storage_path: 'SECRET_FILE', cover_path: 'SECRET_FILE', gallery_images: [{ caption: 'SECRET_FILE' }] }] }), clock).read('galleries');
  assert.equal(data.items.length, 1);
  assert.ok(!JSON.stringify(data).includes('SECRET_FILE'));
});
test('campos JSON publicados também excluem segredos e campos administrativos', async () => {
  const secret = ['sb', 'secret', 'sentinel000000000000000000'].join('_');
  const data = await new PublicSource(config, mockFetch({ robots: [{ ...rows.robots[0], specifications: {
    peso: '1 kg', admin: 'ADMIN_SENTINEL', access_token: secret, nota: secret, chave: publicKey,
  } }] }), clock).read('robots');
  assert.equal(data.items[0].specifications.peso, '1 kg');
  assert.ok(!JSON.stringify(data).includes('ADMIN_SENTINEL'));
  assert.ok(!JSON.stringify(data).includes(secret));
  assert.ok(!JSON.stringify(data).includes(publicKey));
});
test('milestones e categorias eliminam propriedades desconhecidas', async () => {
  const data = structuredClone(rows);
  data.about_page[0].milestones[0].private = 'ADMIN_SENTINEL';
  data.posts[0].post_categories[0].categories.private = 'ADMIN_SENTINEL';
  const source = new PublicSource(config, mockFetch(data), clock);
  assert.ok(!JSON.stringify(await source.read('about_page')).includes('ADMIN_SENTINEL'));
  assert.ok(!JSON.stringify(await source.read('posts')).includes('ADMIN_SENTINEL'));
});
test('slug não consegue mudar host ou base path da fonte', async () => {
  const data = await new PublicSource(config, mockFetch({ robots: [{ ...rows.robots[0], slug: '//evil.test/../admin' }] }), clock).read('robots');
  assert.ok(data.items[0].source_url.startsWith(`${SITE_URL}robos/`));
});
test('website inseguro do patrocinador é omitido', async () => {
  const data = await new PublicSource(config, mockFetch({ sponsors: [{ ...rows.sponsors[0], website_url: 'javascript:alert(1)' }] }), clock).read('sponsors');
  assert.equal(data.items[0].website_url, null);
});
test('limite de 2 MB vale para o total paginado da tabela', async () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ ...rows.projects[0], id: `project-${i}`, body: 'x'.repeat(15000) }));
  const data = await new PublicSource(config, mockFetch({ projects: many }), clock).read('projects');
  assert.equal(data.status, 'partial');
  assert.equal(data.truncated, true);
  assert.equal(data.items.length, 100);
});
test('prazo e sinal são compartilhados por todas as páginas', async () => {
  const signals = [];
  const many = Array.from({ length: 101 }, (_, i) => ({ ...rows.sponsors[0], id: String(i) }));
  const data = await new PublicSource(config, mockFetch({ sponsors: many }, (_, options) => signals.push(options.signal)), clock).read('sponsors');
  assert.equal(data.status, 'available');
  assert.equal(data.items.length, 101);
  assert.equal(signals.length, 2);
  assert.equal(signals[0], signals[1]);
});
