import { loadConfig, AUDITED_SUPABASE_URL } from '../dist/config.js';

export const NOW = '2026-10-05T17:00:00.000Z';
export const publicKey = ['sb', 'publishable', 'fixture0000000'].join('_');
export const config = loadConfig({ NEXT_PUBLIC_SUPABASE_URL: AUDITED_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey });
// Synthetic test data, never shipped as team facts or used as a fallback.
export const rows = {
  about_page: [{ id: 'sobre', headline: 'Institucional de teste', introduction: 'Robótica e educação.',
    institutional_note: '', mission: '', vision: '', values_text: '', robocep: '', partners_title: '', partners_body: '',
    home_headline: '', home_introduction: '', home_history: '', home_mission: '', home_values: '', home_trajectory: '',
    milestones: [{ title: 'Marco de teste', description: 'Conteúdo público.' }], is_published: true }],
  team_members: [{ id: 'member-1', slug: 'pessoa-teste', name: 'Pessoa pública de teste', area: 'Programação',
    role_title: 'Função pública de teste', short_bio: 'Documentação de robótica.', is_published: true }],
  robots: [{ id: 'robot-1', slug: 'robo-teste', name: 'Robô sintético', description: 'Protótipo de teste.',
    mechanisms: ['Mecanismo de teste'], components: ['Sensor de teste'], specifications: { peso: '1 kg' }, is_published: true }],
  projects: [{ id: 'project-1', slug: 'projeto-teste', title: 'Projeto sintético', category: 'Educação',
    description: 'Ação educacional de teste.', body: 'Documentação de teste.', is_published: true }],
  competitions: [{ id: 'event-1', slug: 'evento-teste', event_name: 'Competição sintética', organization: null,
    starts_at: null, ends_at: null, location: null, result: 'Resultado público de teste', awards: ['Prêmio de teste'], report: null, is_published: true }],
  seasons: [{ id: 'season-1', slug: 'temporada-teste', label: 'Temporada sintética', year: 2026,
    summary: null, is_current: true, is_published: true }],
  achievements: [{ id: 'award-1', title: 'Conquista pública de teste', achieved_on: null,
    placement: null, description: 'Registro publicado de teste.', is_published: true }],
  sponsors: [{ id: 'sponsor-1', name: 'Patrocinador sintético', website_url: 'https://example.com/', tier: null, is_published: true }],
  galleries: [{ id: 'gallery-1', slug: 'galeria-teste', title: 'Galeria pública de teste', category: 'Atividade',
    description: 'Metadados de teste.', is_published: true }],
  posts: [{ id: 'post-1', slug: 'post-teste', title: 'Ação de robótica', excerpt: 'Programação e educação.',
    body: 'Documentação: conexão e sensores.', tags: ['robótica'], status: 'published', published_at: '2026-10-01T12:00:00Z',
    post_categories: [{ categories: { name: 'Educação', slug: 'educacao' } }] }],
};
export const clock = () => new Date(NOW);
export function mockFetch(data = rows, inspect = () => {}) {
  return async (input, options) => {
    const url = new URL(input);
    inspect(url, options);
    const table = url.pathname.split('/').at(-1);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return Response.json((data[table] ?? []).slice(offset, offset + 100));
  };
}
