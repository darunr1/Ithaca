import 'dotenv/config';
import { z } from 'zod';
import { atheneConfig, validateAtheneConfig } from './athene/config.js';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  AUTH_MODE: z.enum(['demo', 'supabase']).default('demo'),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_PUBLISHABLE_KEY: z.string().default(''),
  DATA_MODE: z.enum(['demo', 'atlas']).default('demo'),
  MONGODB_URI: z.string().default(''), MONGODB_DB: z.string().default('ithaca_demo'),
  AI_MODE: z.enum(['mock', 'live']).default('mock'),
  GEMINI_API_KEY: z.string().default(''), GEMINI_MODEL: z.string().default('gemini-3.8-flash')
});
export function readConfig(env = process.env) {
  const config = { ...schema.parse(env), ...atheneConfig.parse(env) };
  if (config.DATA_MODE === 'atlas' && !config.MONGODB_URI) throw new Error('Atlas mode requires MONGODB_URI. Choose DATA_MODE=demo explicitly for fixtures.');
  if (config.AI_MODE === 'live' && !config.GEMINI_API_KEY) throw new Error('Live AI requires GEMINI_API_KEY. Choose AI_MODE=mock explicitly for fixtures.');
  if (config.NODE_ENV === 'production' && config.DATA_MODE === 'atlas' && config.AUTH_MODE !== 'supabase') throw new Error('Production Atlas mode requires AUTH_MODE=supabase; demo identities and local access-code sessions are not production authentication.');
  if (config.AUTH_MODE === 'supabase') {
    let validProvider = false;
    try {
      const base = new URL(config.SUPABASE_URL);
      validProvider = base.protocol === 'https:'
        && config.AUTH_ISSUER === `${base.origin}/auth/v1`
        && config.AUTH_JWKS_URL === `${base.origin}/auth/v1/.well-known/jwks.json`;
    } catch { /* handled below */ }
    if (config.DATA_MODE !== 'atlas' || !validProvider || !config.SUPABASE_PUBLISHABLE_KEY || !config.AUTH_AUDIENCE) {
      throw new Error('Supabase authentication requires Atlas mode plus SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, AUTH_JWKS_URL, AUTH_ISSUER, and AUTH_AUDIENCE.');
    }
  }
  validateAtheneConfig(config);
  return config;
}
