import 'dotenv/config';
import { z } from 'zod';
import { atheneConfig, validateAtheneConfig } from './athene/config.js';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  DATA_MODE: z.enum(['demo', 'atlas']).default('demo'),
  MONGODB_URI: z.string().default(''), MONGODB_DB: z.string().default('ithaca_demo'),
  AI_MODE: z.enum(['mock', 'live']).default('mock'),
  GEMINI_API_KEY: z.string().default(''), GEMINI_MODEL: z.string().default('gemini-2.5-flash')
});
export function readConfig(env = process.env) {
  const config = { ...schema.parse(env), ...atheneConfig.parse(env) };
  if (config.DATA_MODE === 'atlas' && !config.MONGODB_URI) throw new Error('Atlas mode requires MONGODB_URI. Choose DATA_MODE=demo explicitly for fixtures.');
  if (config.AI_MODE === 'live' && !config.GEMINI_API_KEY) throw new Error('Live AI requires GEMINI_API_KEY. Choose AI_MODE=mock explicitly for fixtures.');
  validateAtheneConfig(config);
  return config;
}
