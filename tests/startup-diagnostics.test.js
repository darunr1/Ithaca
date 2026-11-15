import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../backend/config.js';
import { describeStartupFailure } from '../backend/startup-diagnostics.js';

test('startup diagnostics identify missing production settings without logging values', () => {
  const secret = 'mongodb+srv://secret-user:secret-password@example.invalid/private';
  let error;
  try {
    readConfig({ NODE_ENV: 'production', DATA_MODE: 'atlas', AUTH_MODE: 'supabase', MONGODB_URI: secret });
  } catch (cause) { error = cause; }
  const diagnostic = describeStartupFailure(error, {
    stage: 'configuration',
    env: { NODE_ENV: 'production', DATA_MODE: 'atlas', AUTH_MODE: 'supabase', MONGODB_URI: secret }
  });
  const output = JSON.stringify(diagnostic);
  assert.equal(diagnostic.code, 'SUPABASE_URL_INVALID');
  assert.deepEqual(diagnostic.fields, ['SUPABASE_URL']);
  assert.equal(diagnostic.environment.present.MONGODB_URI, true);
  assert.ok(!output.includes('secret-user') && !output.includes('secret-password') && !output.includes(secret));
});

test('schema and unknown startup errors are safely redacted', () => {
  let schemaError;
  try { readConfig({ AUTH_MODE: 'not-a-provider' }); } catch (cause) { schemaError = cause; }
  const schema = describeStartupFailure(schemaError, { stage: 'configuration', env: { AUTH_MODE: 'not-a-provider' } });
  assert.equal(schema.code, 'CONFIG_SCHEMA_INVALID');
  assert.deepEqual(schema.fields, ['AUTH_MODE']);
  assert.equal(schema.environment.AUTH_MODE, 'invalid');

  const unknown = describeStartupFailure(new Error('mongodb://user:password@private-host'), { stage: 'database', env: {} });
  assert.equal(unknown.message, 'Startup failed; the underlying error was redacted.');
  assert.ok(!JSON.stringify(unknown).includes('private-host'));
});

test('configuration validation exposes stable safe diagnostic codes', () => {
  const base = {
    NODE_ENV: 'production', DATA_MODE: 'atlas', MONGODB_URI: 'mongodb://example', AUTH_MODE: 'supabase',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public',
    AUTH_ISSUER: 'https://example.supabase.co/auth/v1', AUTH_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json', AUTH_AUDIENCE: 'authenticated'
  };
  for (const [change, code] of [
    [{ MONGODB_URI: '' }, 'ATLAS_URI_REQUIRED'],
    [{ AUTH_MODE: 'demo' }, 'PRODUCTION_SUPABASE_REQUIRED'],
    [{ SUPABASE_PUBLISHABLE_KEY: '' }, 'SUPABASE_PUBLISHABLE_KEY_REQUIRED'],
    [{ AUTH_ISSUER: 'https://wrong.example/auth/v1' }, 'AUTH_ISSUER_MISMATCH'],
    [{ AUTH_JWKS_URL: 'https://wrong.example/jwks.json' }, 'AUTH_JWKS_URL_MISMATCH'],
    [{ AUTH_AUDIENCE: '' }, 'AUTH_AUDIENCE_REQUIRED'],
    [{ AUTH_AUDIENCE: 'ithaca' }, 'AUTH_AUDIENCE_INVALID']
  ]) assert.throws(() => readConfig({ ...base, ...change }), error => error.code === code && error.configurationError === true);
});
