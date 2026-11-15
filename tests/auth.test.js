import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../backend/app.js';
import { readConfig } from '../backend/config.js';
import { provisionClerkProfile } from '../backend/auth/clerk.js';

function database() {
  const data = new Map([['universities', new Map([['uni-a', { id: 'uni-a', name: 'A University', state: 'TX', timezone: 'America/Chicago', semesterStart: '2026-08-24' }]])], ['clubs', new Map()], ['members', new Map()], ['userProfiles', new Map()]]);
  const matches = (record, filter) => Object.entries(filter).every(([key, value]) => record?.[key] === value);
  return {
    data, async command() { return { ok: 1 }; },
    collection(name) {
      const records = data.get(name) || new Map(); data.set(name, records);
      return {
        async findOne(filter, options = {}) { const found = [...records.values()].find(record => matches(record, filter)); if (!found) return null; if (!options.projection) return structuredClone(found); return Object.fromEntries(Object.entries(found).filter(([key]) => options.projection[key] !== 0)); },
        async updateOne(filter, update, options = {}) { let found = [...records.values()].find(record => matches(record, filter)); if (!found && options.upsert) { found = structuredClone(update.$setOnInsert || filter); records.set(found.id, found); } if (found && update.$set) Object.assign(found, structuredClone(update.$set)); return { matchedCount: found ? 1 : 0, upsertedCount: found ? 1 : 0 }; },
        find(filter = {}) { const rows = [...records.values()].filter(record => matches(record, filter)); return { sort() { return this; }, async toArray() { return structuredClone(rows); } }; }
      };
    }
  };
}
const client = { users: { async getUser(id) { return { id, firstName: 'Ada', lastName: 'Lovelace', primaryEmailAddressId: 'email-a', emailAddresses: [{ id: 'email-a', emailAddress: 'ada@example.test', verification: { status: 'verified' } }] }; } } };

test('Clerk profile provisioning is verified, minimal and idempotent', async () => {
  const db = database();
  const first = await provisionClerkProfile(db, 'user-a', client); const second = await provisionClerkProfile(db, 'user-a', { users: { getUser() { throw new Error('should not refetch'); } } });
  assert.equal(first.id, second.id); assert.equal(first.internalMemberId, second.internalMemberId);
  assert.deepEqual([first.role, first.clubIds, first.universityId, first.onboarded], ['member', [], null, false]);
  assert.equal(db.data.get('userProfiles').size, 1); assert.equal(db.data.get('members').size, 0);
  const unverified = { users: { async getUser() { return { firstName: 'No', emailAddresses: [{ id: 'e', emailAddress: 'no@example.test', verification: { status: 'unverified' } }], primaryEmailAddressId: 'e' }; } } };
  await assert.rejects(provisionClerkProfile(database(), 'user-b', unverified), { code: 'EMAIL_VERIFICATION_REQUIRED' });
});

test('Clerk protects APIs, provisions onboarding, and never grants a club or officer role', async t => {
  const db = database(); let signedIn = false;
  const config = readConfig({ AUTH_MODE: 'clerk', CLERK_PUBLISHABLE_KEY: 'pk_test_example', CLERK_SECRET_KEY: 'sk_test_example', DATA_MODE: 'atlas', MONGODB_URI: 'mongodb://example', AI_MODE: 'mock' });
  const app = createApp({ config, db, authentication: { middleware: () => (req, res, next) => next(), getAuth: () => ({ userId: signedIn ? 'user-a' : null }), client } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${root}/api/clubs`)).status, 401);
  assert.equal((await (await fetch(`${root}/api/auth/config`)).json()).data.publishableKey, 'pk_test_example');
  signedIn = true;
  assert.equal((await fetch(`${root}/api/clubs`)).status, 403);
  const me = await (await fetch(`${root}/api/auth/me`)).json(); assert.equal(me.data.onboardingRequired, true);
  const onboarded = await fetch(`${root}/api/auth/onboarding`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ universityId: 'uni-a', major: 'Computer Engineering' }) });
  assert.equal(onboarded.status, 200);
  const member = [...db.data.get('members').values()][0]; assert.deepEqual([member.clubIds, member.visibleToCompanies, member.openToNewClubs], [[], false, false]);
  assert.equal((await (await fetch(`${root}/api/clubs`)).json()).data.length, 0);
  assert.equal((await fetch(`${root}/api/clubs/club-secret/roster`)).status, 404);
});
