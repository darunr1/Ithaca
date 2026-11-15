import { z } from 'zod';

export const atheneConfig = z.object({
  ATHENE_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  ATHENE_GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-001'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(128).max(3072).default(768),
  MONGODB_VECTOR_INDEX: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('athene_chunks_vector'),
  ATHENE_CHUNK_SIZE: z.coerce.number().int().min(200).max(1800).default(1400),
  ATHENE_CHUNK_OVERLAP: z.coerce.number().int().min(0).max(500).default(200),
  ATHENE_TOP_K: z.coerce.number().int().min(1).max(12).default(6),
  ATHENE_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.65),
  AUTH_JWKS_URL: z.string().default(''),
  AUTH_ISSUER: z.string().default(''),
  AUTH_AUDIENCE: z.string().default(''),
  ATHENE_DEV_TOKEN: z.string().default(''),
  ATHENE_DEV_MEMBER_ID: z.string().default('member-iris'),
  NODE_ENV: z.string().default('development')
});

export function validateAtheneConfig(config) {
  if (config.ATHENE_CHUNK_OVERLAP >= config.ATHENE_CHUNK_SIZE) throw new Error('ATHENE_CHUNK_OVERLAP must be smaller than ATHENE_CHUNK_SIZE.');
  if (!config.ATHENE_ENABLED) return;
  if (config.DATA_MODE !== 'atlas' || config.AI_MODE !== 'live') throw new Error('Athene requires DATA_MODE=atlas and AI_MODE=live; there is no production mock fallback.');
  if (config.ATHENE_DEV_TOKEN) {
    if (config.ATHENE_DEV_TOKEN.length < 32 || config.NODE_ENV === 'production' || !['127.0.0.1', '::1', 'localhost'].includes(config.HOST) || !config.MONGODB_DB.endsWith('_demo')) {
      throw new Error('ATHENE_DEV_TOKEN requires 32+ characters, loopback HOST, a _demo database, and non-production NODE_ENV.');
    }
  } else if (!config.AUTH_JWKS_URL || !config.AUTH_ISSUER || !config.AUTH_AUDIENCE || new URL(config.AUTH_JWKS_URL).protocol !== 'https:') {
    throw new Error('Athene requires HTTPS AUTH_JWKS_URL, AUTH_ISSUER and AUTH_AUDIENCE, or a restricted local development token.');
  }
}
