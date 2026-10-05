import { SITE_URL } from './config.js';
import type { PublicItem } from './catalog.js';

// Versioned minimum identity, checked against the public page and src/config/site.ts.
// Do not turn placeholders, future plans or schema categories into team facts.
export const institution: PublicItem = {
  name: 'ACRUX ROBOCEP',
  description: 'Equipe de robótica ACRUX ROBOCEP.',
  status: 'published',
  source_url: SITE_URL,
  source_type: 'versioned_public_site_identity',
  source_checked_at: '2026-10-05T17:00:01.273Z',
};
