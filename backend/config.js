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
  MONGODB_URI: z.string().default(''), MONGODB_DB: z.string().min(1).default('ithaca_demo'),
  AI_MODE: z.enum(['mock', 'live']).default('mock'),
  GEMINI_API_KEY: z.string().default(''), GEMINI_MODEL: z.string().min(1).default('gemini-3.8-flash')
});

const invalid = (code, message, variables = []) => Object.assign(new Error(message), {
  code,
  configurationError: true,
  diagnosticFields: variables,
  safeToLog: true
});

export function readConfig(env = process.env) {
  const config = { ...schema.parse(env), ...atheneConfig.parse(env) };
  if (config.DATA_MODE === 'atlas' && !config.MONGODB_URI) throw invalid('ATLAS_URI_REQUIRED', 'Atlas mode requires MONGODB_URI.', ['DATA_MODE', 'MONGODB_URI']);
  if (config.AI_MODE === 'live' && !config.GEMINI_API_KEY) throw invalid('GEMINI_KEY_REQUIRED', 'Live AI requires GEMINI_API_KEY.', ['AI_MODE', 'GEMINI_API_KEY']);
  if (config.NODE_ENV === 'production' && config.DATA_MODE === 'atlas' && config.AUTH_MODE !== 'supabase') {
    throw invalid('PRODUCTION_SUPABASE_REQUIRED', 'Production Atlas mode requires AUTH_MODE=supabase.', ['NODE_ENV', 'DATA_MODE', 'AUTH_MODE']);
  }
  if (config.AUTH_MODE === 'supabase') {
    let base;
    try {
      base = new URL(config.SUPABASE_URL);
    } catch { throw invalid('SUPABASE_URL_INVALID', 'SUPABASE_URL must be a valid HTTPS URL.', ['SUPABASE_URL']); }
    if (config.DATA_MODE !== 'atlas') throw invalid('SUPABASE_REQUIRES_ATLAS', 'Supabase production authentication requires DATA_MODE=atlas.', ['AUTH_MODE', 'DATA_MODE']);
    if (base.protocol !== 'https:') throw invalid('SUPABASE_URL_INVALID', 'SUPABASE_URL must be a valid HTTPS URL.', ['SUPABASE_URL']);
    if (!config.SUPABASE_PUBLISHABLE_KEY) throw invalid('SUPABASE_PUBLISHABLE_KEY_REQUIRED', 'Supabase authentication requires SUPABASE_PUBLISHABLE_KEY.', ['SUPABASE_PUBLISHABLE_KEY']);
    if (config.AUTH_ISSUER !== `${base.origin}/auth/v1`) throw invalid('AUTH_ISSUER_MISMATCH', 'AUTH_ISSUER must match the configured Supabase project.', ['SUPABASE_URL', 'AUTH_ISSUER']);
    if (config.AUTH_JWKS_URL !== `${base.origin}/auth/v1/.well-known/jwks.json`) throw invalid('AUTH_JWKS_URL_MISMATCH', 'AUTH_JWKS_URL must match the configured Supabase project.', ['SUPABASE_URL', 'AUTH_JWKS_URL']);
    if (!config.AUTH_AUDIENCE) throw invalid('AUTH_AUDIENCE_REQUIRED', 'Supabase authentication requires AUTH_AUDIENCE.', ['AUTH_AUDIENCE']);
    if (config.AUTH_AUDIENCE !== 'authenticated') throw invalid('AUTH_AUDIENCE_INVALID', 'Supabase AUTH_AUDIENCE must be authenticated.', ['AUTH_AUDIENCE']);
  }
  validateAtheneConfig(config);
  return config;
}
