# ACRUX ROBOCEP — MCP V1

Servidor Node.js separado do site, com as 10 ferramentas de consulta de
conteúdo público publicado. Usa SDK oficial MCP estável (`@modelcontextprotocol/server`
2.3.1, adapter Node 2.1.1), Zod e Streamable HTTP. Nenhum endpoint escreve dados.
O site e suas políticas RLS permanecem sem alterações.

## Executar localmente

Requer Node.js 24; a versão reproduzível está em `.node-version`.

```sh
npm ci --include=dev --ignore-scripts
npm run build
```

Copie `.env.example` para `.env` e preencha, se quiser dados ao vivo, **somente**
as duas variáveis públicas descritas abaixo. A chave não está no repositório.
Sem elas, as ferramentas retornam `unavailable`; a visão geral conserva apenas
a identidade institucional mínima versionada, sem inventar conteúdo.

```sh
npm start
```

- `GET /health`: retorna exatamente `{"status":"ok"}`. É verificação de
  processo, não prova disponibilidade do Supabase.
- `POST /mcp`: Streamable HTTP sem estado, com respostas JSON e suporte aos
  protocolos atual e legado do SDK. `GET`/`DELETE` retornam 405: não há streams
  SSE de fundo, sessões ou assinaturas. `OPTIONS` atende preflight autorizado.
- Bind padrão `HOST=0.0.0.0`; a porta vem de `PORT` da hospedagem.

As respostas HTTP exigem Host permitido; Origin, quando presente, também deve
ser exatamente permitida. Clientes servidor a servidor podem omitir Origin.

## Variáveis permitidas

| Variável | Padrão / finalidade |
|---|---|
| `HOST` | `0.0.0.0`; aceita também `127.0.0.1` ou `::1` |
| `PORT` | `3000` local; no Render usa a porta fornecida pela plataforma |
| `NEXT_PUBLIC_SUPABASE_URL` | Opcional junto com a chave; projeto público auditado `https://gxzpaocmgllycssxlena.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública `sb_publishable_...`, a mesma distribuída pelo site; não é sessão de usuário |
| `ALLOWED_HOSTS` | Autoridades exatas adicionais separadas por vírgula; ex.: `mcp.seudominio.com` ou `localhost:3000`; sem wildcard |
| `ALLOWED_ORIGINS` | `https://chatgpt.com,https://chat.openai.com`; origens exatas, incluindo esquema e porta, sem barra final |
| `RENDER_EXTERNAL_URL` | Fornecida pelo Render; seu Host HTTPS é permitido automaticamente |
| `NODE_ENV` | `production` no Blueprint; variável padrão do runtime |

Obtenha a URL e a chave publishable da configuração pública já usada pelo site.
Não forneça credenciais administrativas ao plugin. Chaves `secret`, JWTs e
service-role são recusadas inclusive se colocadas na variável pública.
`SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ACCESS_TOKEN`
fazem o processo falhar fechado, sem imprimir seus valores.
Não são usados Auth, cookies, Bearer tokens, Management API, SQL, RPCs,
Storage nem sessões persistidas. `Authorization` recebida pelo MCP nunca é
repassada ao Supabase. Um projeto Supabase diferente exige nova auditoria e
revisão da allowlist no código.

## Ferramentas

| Ferramenta | Fonte | Argumentos |
|---|---|---|
| `get_team_overview` | Identidade mínima versionada e `about_page` | `{}` |
| `get_team_info` | `team_members` publicados, sem vínculo a profiles | `{}` |
| `get_robots` | `robots` publicados, incluindo mecanismos/componentes/especificações | `{}` |
| `get_projects` | `projects` publicados | `{}` |
| `get_competitions` | `competitions` e `seasons`, com disponibilidade separada | `{}` |
| `get_achievements` | Apenas `achievements` publicados | `{}` |
| `get_blog_posts` | `posts` e categorias ligadas a posts publicados | `limit?` (1–50; padrão 20), `category?` (nome ou slug) |
| `get_sponsors` | Apenas `sponsors` publicados | `{}` |
| `get_gallery_info` | Título, categoria e descrição de `galleries` publicadas | `{}` |
| `search_acrux` | Todas as 10 tabelas auditadas e identidade institucional | `query` (2–200 caracteres), `limit?` (1–50; padrão 20) |

Argumentos desconhecidos são recusados. Todas têm `readOnlyHint: true`,
`destructiveHint: false`, `idempotentHint: true` e `openWorldHint: true`, pois
consultam uma fonte pública externa.

Cada item tem `status: published`, `source_url`, `source_type` e
`source_checked_at`. `supabase_public_site` significa conteúdo público do site
lido via sua API estruturada. Não se devolvem credenciais ou dumps de tabelas.
O envelope distingue `available`, `empty`, `unavailable` e `partial`; estes
são estados da consulta, distintos do estado editorial do item. `sources`
detalha as consultas combinadas. Ausência e erro de RLS são explicitados.
O fallback institucional usa a data da verificação versionada, sem sugerir uma
consulta ao vivo. Dados ao vivo são verificados novamente em cada chamada.

Somente `is_published = true` ou posts `status = published` com data alcançada
passam. `draft`, `planned`, `archived` e estados desconhecidos são excluídos;
uma temporada ou menção editorial a planos nunca vira participação, resultado
ou conquista confirmada. Nenhuma tool completa conteúdo ausente por inferência.

## Busca e limites

A busca ignora caixa e acentos, remove palavras funcionais comuns em português
e exige correspondência de todos os termos relevantes. Faz correspondência de
palavra inteira ou prefixo com pelo menos três caracteres; não procura em IDs,
URLs, datas ou metadados técnicos. Resultados com termos no título recebem
prioridade. Não há busca semântica nem correção de erros de digitação.

As consultas usam projeções de colunas permitidas, filtros editoriais e RLS
anônima. Há limite de 1000 linhas e 2 MB por tabela, páginas de 100 linhas e
prazo total de 8 segundos por tabela. Limites e formatos incompatíveis são
reportados como `partial`; erros de rede/permissão retornam listas vazias e
`unavailable`. A busca é limitada ao conteúdo dessas consultas, não a sites
externos dos patrocinadores. Requisições MCP aceitam até 64 KiB de corpo.

Campos JSON de mecanismos, componentes e prêmios aceitam listas de texto;
especificações aceitam valores escalares. Formatos históricos diferentes são
omitidos com aviso, sem expor JSON arbitrário. Galeria retorna metadados do
álbum; arquivos, thumbnails e caminhos não fazem parte da V1.

## Plugin

`plugin.json` segue **Agent Plugins 1.0**; o nome técnico é
`acrux-robocep-plugin`, e o nome exibido é **ACRUX ROBOCEP**. A descrição pedida
é preservada em `description` e `longDescription`. O subtítulo usa
“Informações públicas da ACRUX” para atender ao limite de 30 caracteres.
Os três starter prompts foram preservados. Não foram inventados autor,
contato, licença, domínio de hospedagem, ID de app ou outras informações.

`mcp.json` aponta para `http://127.0.0.1:3000/mcp`, para uso local com o servidor
em execução. Para ChatGPT remoto, depois de um deploy autorizado, substitua
essa URL pelo endpoint HTTPS real `/mcp` e valide a conexão no host escolhido.
A preparação do manifest não instala o plugin nem publica seu servidor.

## Render Free — preparado, sem deploy

O `render.yaml` configura um web service Node Free na branch `feat/mcp-v1`,
com autodeploy desligado, health check `/health` e bind `0.0.0.0`. O build
inclui as dependências de desenvolvimento para compilar TypeScript mesmo com
`NODE_ENV=production`. O Render fornece `PORT` e `RENDER_EXTERNAL_URL`.
Não há segredo real no Blueprint: os dois campos Supabase `sync: false`
devem receber apenas valores públicos quando houver autorização de deploy.

Um deploy inicial pelo Blueprint cria o serviço mesmo com autodeploy desligado;
por isso **não aplique o Blueprint sem autorização**. Não houve deploy nesta
entrega. Render Free pode suspender por inatividade e ter demora no primeiro
acesso. TLS fica na hospedagem. Se o proxy ou domínio mudar o Host recebido,
adicione sua autoridade confirmada à allowlist; nunca habilite `*`.

## Validação

```sh
npm test
npm run check
npm run audit:public
```

Os testes são offline, com dados sintéticos, e cobrem todas as tools, schemas,
chamadas do cliente oficial, protocolo legado, HTTP, saúde, Host/Origin,
publicação, rascunhos, privacidade, busca em português e ausência de segredos.
`check` verifica TypeScript, os manifests e o Blueprint contra cópias
versionadas dos schemas oficiais e procura credenciais literais. `audit:public`
é opt-in e usa apenas as duas variáveis públicas para imprimir contagens.
O workflow GitHub executa `npm test` e `npm run check`, sem qualquer deploy.

Leia [a auditoria de dados públicos](docs/public-data-audit.md) para tabelas,
RLS, buckets, contagens verificadas e limitações. Dados disponíveis em
5/10/2026: 7 integrantes, 4 patrocinadores, 1 post, 1 temporada e 1 página
institucional. Robôs, projetos, competições, conquistas e galerias estavam vazios.

## Referências oficiais

- [MCP TypeScript SDK estável](https://ts.sdk.modelcontextprotocol.io/v2/)
- [Streamable HTTP](https://modelcontextprotocol.io/specification/latest/basic/transports)
- [Supabase: chaves públicas e privilegiadas](https://supabase.com/docs/guides/getting-started/api-keys)
- [Agent Plugins: schema do manifest](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
- [Render: Blueprint](https://render.com/docs/blueprint-spec)

Desenvolvimento e envio restritos a `feat/mcp-v1`. Sem merge na `main`,
sem alterações no site e sem deploy.
