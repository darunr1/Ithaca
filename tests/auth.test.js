import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../backend/app.js';
import { readConfig } from '../backend/config.js';
import { createSupabaseVerifier, provisionSupabaseProfile } from '../backend/auth/supabase.js';

function database() {
  const data = new Map([['universities', new Map([['uni-a', { id: 'uni-a', name: 'A University', state: 'TX', timezone: 'America/Chicago', semesterStart: '2026-08-24' }]])], ['clubs', new Map()], ['members', new Map()], ['userProfiles', new Map()], ['resumeFiles', new Map()]]);
  const matches = (record, filter) => Object.entries(filter).every(([key, value]) => record?.[key] === value);
  return {
    data, async command() { return { ok: 1 }; },
    collection(name) {
      const records = data.get(name) || new Map(); data.set(name, records);
      return {
        async findOne(filter, options = {}) { const found = [...records.values()].find(record => matches(record, filter)); if (!found) return null; if (!options.projection) return structuredClone(found); return Object.fromEntries(Object.entries(found).filter(([key]) => options.projection[key] !== 0)); },
        async updateOne(filter, update, options = {}) { let found = [...records.values()].find(record => matches(record, filter)); if (!found && options.upsert) { found = structuredClone(update.$setOnInsert || filter); records.set(found.id, found); } if (found && update.$set) Object.assign(found, structuredClone(update.$set)); return { matchedCount: found ? 1 : 0, upsertedCount: found ? 1 : 0 }; },
        async deleteOne(filter) { const found = [...records.values()].find(record => matches(record, filter)); if (found) records.delete(found.id); return { deletedCount: found ? 1 : 0 }; },
        find(filter = {}) { const rows = [...records.values()].filter(record => matches(record, filter)); return { sort() { return this; }, async toArray() { return structuredClone(rows); } }; }
      };
    }
  };
}
const identity = { sub: '19bb056b-1dc7-4967-89d1-a2ca4552f55f', name: 'Ada Lovelace', email: 'ada@example.test' };

test('live Supabase, Atlas and Athena production configuration starts without local auth', () => {
  const config = readConfig({
    NODE_ENV: 'production', AUTH_MODE: 'supabase', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    AUTH_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json', AUTH_ISSUER: 'https://example.supabase.co/auth/v1', AUTH_AUDIENCE: 'authenticated',
    DATA_MODE: 'atlas', MONGODB_URI: 'mongodb://example', AI_MODE: 'live', GEMINI_API_KEY: 'test-only', ATHENE_ENABLED: 'true'
  });
  assert.deepEqual([config.AUTH_MODE, config.DATA_MODE, config.AI_MODE, config.ATHENE_ENABLED], ['supabase', 'atlas', 'live', true]);
  assert.equal(config.ATHENE_DEV_TOKEN, '');
});

test('Supabase verifier accepts only current project JWTs and confirmed users', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const config = { AUTH_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json', AUTH_ISSUER: 'https://example.supabase.co/auth/v1', AUTH_AUDIENCE: 'authenticated', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' };
  const client = { auth: { async getUser() { return { data: { user: { id: identity.sub, email: identity.email, email_confirmed_at: new Date().toISOString(), user_metadata: { full_name: identity.name } } }, error: null }; } } };
  const verify = createSupabaseVerifier(config, { client, keySet: createLocalJWKSet({ keys: [jwk] }) });
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setSubject(identity.sub).setIssuer(config.AUTH_ISSUER).setAudience(config.AUTH_AUDIENCE).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  assert.deepEqual(await verify({ get: () => `Bearer ${token}` }), identity);
  const wrongAudience = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setSubject(identity.sub).setIssuer(config.AUTH_ISSUER).setAudience('not-ithaca').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  await assert.rejects(verify({ get: () => `Bearer ${wrongAudience}` }), { code: 'INVALID_SESSION' });
  const expired = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setSubject(identity.sub).setIssuer(config.AUTH_ISSUER).setAudience(config.AUTH_AUDIENCE).setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(privateKey);
  await assert.rejects(verify({ get: () => `Bearer ${expired}` }), { code: 'INVALID_SESSION' });
});

test('Supabase profile provisioning is minimal, deterministic and idempotent', async () => {
  const db = database();
  const first = await provisionSupabaseProfile(db, identity); const second = await provisionSupabaseProfile(db, identity);
  assert.equal(first.id, second.id); assert.equal(first.internalMemberId, second.internalMemberId);
  assert.equal(first.internalMemberId, identity.sub);
  assert.deepEqual([first.role, first.clubIds, first.universityId, first.onboarded], ['member', [], null, false]);
  assert.equal(db.data.get('userProfiles').size, 1); assert.equal(db.data.get('members').size, 0);
});

test('Supabase protects APIs, provisions onboarding, and never trusts client roles or demo identity', async t => {
  const db = database();
  const config = readConfig({ AUTH_MODE: 'supabase', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example', AUTH_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json', AUTH_ISSUER: 'https://example.supabase.co/auth/v1', AUTH_AUDIENCE: 'authenticated', DATA_MODE: 'atlas', MONGODB_URI: 'mongodb://example', AI_MODE: 'mock' });
  const verify = async req => {
    if (req.get('Authorization') !== 'Bearer verified-token') throw Object.assign(new Error('Sign in to continue.'), { status: 401, code: 'UNAUTHENTICATED' });
    return identity;
  };
  const app = createApp({ config, db, authentication: { verify } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${root}/api/clubs`)).status, 401);
  assert.equal((await fetch(`${root}/api/clubs`, { headers: { 'X-Demo-Member': 'member-iris' } })).status, 401);
  const publicConfig = (await (await fetch(`${root}/api/auth/config`)).json()).data;
  assert.deepEqual([publicConfig.mode, publicConfig.publishableKey], ['supabase', 'sb_publishable_example']);
  const headers = { Authorization: 'Bearer verified-token' };
  assert.equal((await fetch(`${root}/api/clubs`, { headers })).status, 403);
  const me = await (await fetch(`${root}/api/auth/me`, { headers })).json(); assert.equal(me.data.onboardingRequired, true);
  const onboardingData = { universityName: 'A University', classification: 'sophomore', major: 'Computer Engineering', graduationYear: new Date().getUTCFullYear() + 2 };
  const onboarded = await fetch(`${root}/api/auth/onboarding`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...onboardingData, role: 'officer' }) });
  assert.equal(onboarded.status, 400, 'unknown role fields are rejected');
  const suggestions = await (await fetch(`${root}/api/auth/university-search?q=utd`, { headers })).json();
  assert.ok(suggestions.data.universities.some(university => university.name === 'University of Texas at Dallas'));
  assert.equal((await fetch(`${root}/api/auth/university-search?q=utd`)).status, 401);

  const resumeFile = '%PDF-1.4\\n1 0 obj << /Type /Catalog >> endobj\\n%%EOF';
  const resumeForm = new FormData();
  resumeForm.append('resume', new Blob([resumeFile], { type: 'application/pdf' }), 'student-resume.pdf');
  assert.equal((await fetch(`${root}/api/auth/resume`, { method: 'POST', body: resumeForm })).status, 401);
  const uploaded = await fetch(`${root}/api/auth/resume`, { method: 'POST', headers, body: resumeForm });
  assert.equal(uploaded.status, 200);
  assert.equal((await uploaded.json()).data.resume.filename, 'student-resume.pdf');
  const resumeDownload = await fetch(`${root}/api/auth/resume`, { headers });
  assert.equal(resumeDownload.status, 200);
  assert.match(resumeDownload.headers.get('content-disposition'), /attachment/);
  assert.equal(await resumeDownload.text(), resumeFile);
  const checkedProfile = await (await fetch(`${root}/api/auth/me`, { headers })).json();
  assert.equal(checkedProfile.data.profile.resume.size, Buffer.byteLength(resumeFile));
  assert.equal(JSON.stringify(checkedProfile).includes(resumeFile), false);
  const badForm = new FormData();
  badForm.append('resume', new Blob(['definitely not a resume'], { type: 'text/plain' }), 'notes.txt');
  assert.equal((await fetch(`${root}/api/auth/resume`, { method: 'POST', headers, body: badForm })).status, 415);

  const accepted = await fetch(`${root}/api/auth/onboarding`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(onboardingData) });
  assert.equal(accepted.status, 200);
  const member = [...db.data.get('members').values()][0]; assert.deepEqual([member.clubIds, member.visibleToCompanies, member.openToNewClubs], [[], false, false]);
  assert.equal(member.supabaseUserId, identity.sub);
  assert.equal(member.universityId, 'uni-a');
  assert.equal(member.universityName, 'A University');
  assert.equal(member.classification, 'sophomore');
  assert.equal(member.year, 2);
  assert.equal(db.data.get('resumeFiles').size, 1);
  assert.equal((await fetch(`${root}/api/auth/resume`, { headers: {} })).status, 401);
  assert.equal((await fetch(`${root}/api/auth/resume`, { method: 'DELETE', headers })).status, 200);
  assert.equal(db.data.get('resumeFiles').size, 0);
  assert.equal((await fetch(`${root}/api/auth/resume`, { headers })).status, 404);
  assert.equal((await (await fetch(`${root}/api/clubs`, { headers })).json()).data.length, 0);
  assert.equal((await fetch(`${root}/api/clubs/club-secret/roster`, { headers })).status, 404);

  // Legacy accounts incorrectly marked 'onboarded' must still complete missing student fields.
  const savedProfile = [...db.data.get('userProfiles').values()][0];
  const savedMember = [...db.data.get('members').values()][0];
  savedProfile.classification = null;
  savedProfile.universityName = null;
  savedMember.classification = undefined;
  savedMember.universityName = undefined;
  const incompleteMe = await (await fetch(`${root}/api/auth/me`, { headers })).json();
  assert.equal(incompleteMe.data.onboardingRequired, true);
  const incompleteResponse = await fetch(`${root}/api/clubs`, { headers });
  assert.equal(incompleteResponse.status, 403);
  assert.equal((await incompleteResponse.json()).error.code, 'ONBOARDING_REQUIRED');

  const finished = await fetch(`${root}/api/auth/onboarding`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(onboardingData)
  });
  assert.equal(finished.status, 200);
  assert.equal((await (await fetch(`${root}/api/auth/me`, { headers })).json()).data.onboardingRequired, false);
  assert.equal(savedMember.classification, 'sophomore');

  // Edits must update academic details without modifying existing club access.
  savedMember.clubIds = ['club-existing'];
  const edited = await fetch(`${root}/api/auth/onboarding`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...onboardingData, classification: 'junior', major: 'Electrical Engineering' })
  });
  assert.equal(edited.status, 200);
  assert.deepEqual(savedMember.clubIds, ['club-existing']);
  assert.equal(savedMember.classification, 'junior');
  assert.equal(savedMember.year, 3);
  assert.equal(savedProfile.major, 'Electrical Engineering');

  // Members cannot unilaterally change university while retaining club privileges.
  const transfer = await fetch(`${root}/api/auth/onboarding`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...onboardingData, universityName: 'Different University' })
  });
  assert.equal(transfer.status, 409);
  assert.equal(savedMember.universityId, 'uni-a');
});
