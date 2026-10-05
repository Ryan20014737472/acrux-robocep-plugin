import { z } from 'zod';

// Objects strip unknown fields; each request selects only these audited columns.
// Foreign keys, profiles, author IDs, Storage paths and admin fields are excluded.
const text = z.string().max(100_000);
const nullableText = text.nullable();
const base = { id: text, is_published: z.boolean() };
const slug = text;
const list = z.array(text).max(100);
const specs = z.record(text.max(100), z.union([text, z.number(), z.boolean(), z.null()]));
export const TABLES = {
  about_page: { route: 'sobre/', label: 'informações institucionais', order: 'id.asc', schema: z.object({ ...base,
    headline: text, introduction: text, institutional_note: text, mission: text, vision: text,
    values_text: text, robocep: text, partners_title: text, partners_body: text,
    milestones: z.array(z.object({ title: text, description: text })).max(12),
    home_headline: text, home_introduction: text, home_history: text, home_mission: text,
    home_values: text, home_trajectory: text }) },
  team_members: { route: 'equipe/', label: 'integrantes', order: 'display_order.asc,id.asc', schema: z.object({ ...base,
    slug, name: text, area: nullableText, role_title: nullableText, short_bio: nullableText }) },
  robots: { route: 'robos/', label: 'robôs', order: 'id.asc', schema: z.object({ ...base, slug, name: text,
    description: nullableText, mechanisms: list, components: list, specifications: specs }) },
  projects: { route: 'projetos/', label: 'projetos', order: 'id.asc', schema: z.object({ ...base, slug,
    title: text, category: text, description: nullableText, body: nullableText }) },
  competitions: { route: 'competicoes/', label: 'competições', order: 'starts_at.desc.nullslast,id.asc', schema: z.object({ ...base, slug,
    event_name: text, organization: nullableText, starts_at: nullableText, ends_at: nullableText,
    location: nullableText, result: nullableText, awards: list, report: nullableText }) },
  seasons: { route: 'temporadas/', label: 'temporadas', order: 'year.desc,id.asc', schema: z.object({ ...base, slug,
    label: text, year: z.number().int(), summary: nullableText, is_current: z.boolean() }) },
  achievements: { route: '', label: 'conquistas', order: 'achieved_on.desc.nullslast,id.asc', schema: z.object({ ...base,
    title: text, achieved_on: nullableText, placement: nullableText, description: nullableText }) },
  sponsors: { route: '', label: 'patrocinadores', order: 'display_order.asc,id.asc', schema: z.object({ ...base,
    name: text, website_url: nullableText, tier: nullableText }) },
  galleries: { route: 'galeria/', label: 'galerias', order: 'created_at.desc,id.asc', schema: z.object({ ...base, slug,
    title: text, category: nullableText, description: nullableText }) },
  posts: { route: 'blog/', label: 'posts', order: 'published_at.desc,id.asc', schema: z.object({ id: text, slug,
    title: text, excerpt: text, body: text, tags: list, status: z.literal('published'),
    published_at: text,
    post_categories: z.array(z.object({ categories: z.object({ name: text, slug }).nullable() })).max(100) }) },
} as const;
export type Table = keyof typeof TABLES;
export type PublicItem = Record<string, unknown> & {
  status: 'published'; source_url: string; source_type: string; source_checked_at: string;
};
export interface SourceResult {
  table: string;
  status: 'available' | 'empty' | 'unavailable' | 'partial';
  message: string;
  items: PublicItem[];
  source_url: string;
  source_type: string;
  source_checked_at: string;
  truncated: boolean;
}

export function columnsFor(table: Table): string {
  const fields = Object.keys(TABLES[table].schema.shape).filter(key => key !== 'post_categories');
  if (table === 'posts') fields.push('post_categories(categories(name,slug))');
  return fields.join(',');
}
