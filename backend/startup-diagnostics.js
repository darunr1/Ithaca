const modes = {
  AUTH_MODE: ['demo', 'supabase'],
  DATA_MODE: ['demo', 'atlas'],
  AI_MODE: ['mock', 'live'],
  ATHENE_ENABLED: ['true', 'false']
};

const required = [
  'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'AUTH_JWKS_URL', 'AUTH_ISSUER', 'AUTH_AUDIENCE',
  'MONGODB_URI', 'MONGODB_DB', 'GEMINI_API_KEY', 'ATHENE_GEMINI_MODEL', 'GEMINI_EMBEDDING_MODEL',
  'MONGODB_VECTOR_INDEX'
];

function modeState(env, name) {
  const value = env[name];
  if (!value) return 'missing/default';
  return modes[name].includes(value) ? value : 'invalid';
}

export function describeStartupFailure(error, { stage = 'unknown', env = process.env } = {}) {
  const schemaFailure = error?.name === 'ZodError' && Array.isArray(error.issues);
  const fields = schemaFailure
    ? [...new Set(error.issues.map(issue => String(issue.path?.[0] || 'configuration')))].sort()
    : [...new Set(error?.diagnosticFields || [])].sort();
  return {
    event: 'ithaca_serverless_startup_failed',
    stage,
    code: schemaFailure ? 'CONFIG_SCHEMA_INVALID' : error?.code || 'STARTUP_FAILED',
    message: schemaFailure
      ? 'One or more environment variables have an invalid type, enum value, or numeric range.'
      : error?.safeToLog ? error.message : 'Startup failed; the underlying error was redacted.',
    fields,
    environment: {
      NODE_ENV: 'production',
      AUTH_MODE: modeState(env, 'AUTH_MODE'),
      DATA_MODE: modeState(env, 'DATA_MODE'),
      AI_MODE: modeState(env, 'AI_MODE'),
      ATHENE_ENABLED: modeState(env, 'ATHENE_ENABLED'),
      present: Object.fromEntries(required.map(name => [name, Boolean(env[name])]))
    }
  };
}

const logged = globalThis.__ithacaLoggedStartupFailures ??= new Set();
export function logStartupFailure(error, context) {
  const diagnostic = describeStartupFailure(error, context);
  const signature = `${diagnostic.stage}:${diagnostic.code}:${diagnostic.fields.join(',')}`;
  if (!logged.has(signature)) {
    if (logged.size >= 20) logged.clear();
    logged.add(signature);
    console.error(JSON.stringify(diagnostic));
  }
  return diagnostic;
}
