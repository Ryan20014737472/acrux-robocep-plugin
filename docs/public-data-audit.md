# Auditoria das fontes públicas — V1

Consulta em 5 de outubro de 2026, 14:21 (America/Sao_Paulo), por acesso
anônimo com a chave **publishable** já distribuída pelo site público.
Nenhuma sessão de usuário, chave secret, service-role, Management API ou
consulta SQL administrativa foi usada. O site não foi alterado.

Fonte de código auditada:
[`Blog-acrux-`, commit `c8016364d7b2aae536f72c5a725bdb0c403f8644`](https://github.com/Ryan20014737472/Blog-acrux-/tree/c8016364d7b2aae536f72c5a725bdb0c403f8644).
Foram lidos schema, todas as migrações, tipos, configuração de Supabase,
serviços, formulários de conteúdo, componentes públicos e helpers de Storage.
O contrato `src/services/content-service.ts` é apenas uma interface;
schema/migrações e consultas reais determinaram a implementação.

O repositório do site pede uso de graphify para perguntas sobre código;
o executável/módulo não estava disponível no ambiente. A auditoria foi feita
diretamente nas fontes e confirmada pela API pública, sem instalar ferramentas
nem gerar alterações no site.

## Disponibilidade observada com o código da V1

| Tabela | Regra pública | Publicados encontrados | Uso na V1 |
|---|---|---:|---|
| `about_page` | `is_published = true` | 1 | Visão institucional |
| `team_members` | `is_published = true` | 7 | Integrantes e funções |
| `robots` | `is_published = true` | 0 | Lista vazia |
| `projects` | `is_published = true` | 0 | Lista vazia |
| `competitions` | `is_published = true` | 0 | Sem participações confirmadas |
| `seasons` | `is_published = true` | 1 | Temporada publicada |
| `achievements` | `is_published = true` | 0 | Lista vazia; nenhuma conquista inferida |
| `sponsors` | `is_published = true` | 4 | Patrocinadores publicados |
| `galleries` | `is_published = true` | 0 | Metadados vazios |
| `posts` | `status = published`, data não nula e já alcançada | 1 | Blog e busca |

Todas as 10 consultas tiveram sucesso sem autenticação de usuário. A auditoria
não prova que todas as migrações locais estão aplicadas no banco; prova a leitura
anônima das projeções e filtros usados pela V1 no momento indicado.
Não há snapshot de registros pessoais ou conteúdo do blog embutido no plugin.

Dados atualmente encontrados: uma apresentação institucional curta, sete
perfis publicados, quatro patrocinadores, a temporada `biobuzz 2026-2027`
e o post sobre a visita à Abelha Brasil em Mandirituba. Missão, visão e valores
da página institucional estavam vazios; não foram completados por inferência.

`get_robots`, `get_projects`, `get_achievements` e `get_gallery_info` retornam
listas vazias por falta de conteúdo publicado. `get_competitions` retorna a
temporada, com a fonte `competitions` marcada `empty`; uma temporada não
comprova participação, resultado ou conquista.

## Outras tabelas e relações

As migrações identificam leitura pública de `categories` (3 registros
observados) e `team_areas` (7 observados). São taxonomias, não comprovação de
projetos, pessoas ou funções preenchidas. A V1 usa categorias apenas quando
ligadas a posts publicados pelo relacionamento `post_categories`.

`post_categories` permite leitura quando o post relacionado é público;
essa relação foi verificada na consulta real do post. `gallery_images` permite
leitura quando a galeria é publicada. As relações `robot_team_members`,
`project_team_members` e `competition_team_members` dependem da publicação do
objeto relacionado. Estas quatro últimas relações não são consultadas pela V1.
Uma relação pública nunca é usada para revelar um integrante não publicado.

`profiles` exige usuário correspondente ou administrador; `media_assets` exige
editor. O schema `private`, notificações, fila de email, funções privilegiadas,
Auth e endpoints administrativos não são fontes do plugin e não foram lidos.
Negativa RLS, erro de permissão ou indisponibilidade produz `unavailable` e
lista vazia; não há tentativa de acesso privilegiado.

## Storage e publicação

As migrações criam buckets públicos `avatars`, `blog`, `robots`, `projects`,
`gallery` e `sponsors` e uma política de leitura dos seus objetos. Essa
política é mais ampla que publicação editorial: um arquivo público pode existir
sem seu conteúdo estar publicado. Por isso a V1 não enumera Storage, não
retorna caminhos, não assina URLs e não consulta `media_assets` ou `gallery_images`.
`get_gallery_info` usa apenas título, categoria e descrição da galeria publicada.

O enum de posts contém `draft`, `published`, `archived`; outras tabelas usam
`is_published`, sem enum de estado de execução. O servidor exige publicação
positiva e descarta qualquer estado adicional `draft`, `planned`, `archived`
ou desconhecido. Texto editorial sobre planos não é convertido em resultado
confirmado. Conteúdo retornado conserva a proveniência e não é tratado como
instrução ao assistente.

## Reprodução

Configure somente `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` de acesso público. Execute:

```sh
npm run audit:public
```

O comando imprime contagens, fonte, status e data, sem registros, chaves ou
variáveis de ambiente. As contagens podem mudar após publicações ou retiradas.
