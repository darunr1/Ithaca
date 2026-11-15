import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../backend/app.js';
import { readConfig } from '../backend/config.js';

function createDatabase() {
  const collections = new Map();
  const read = (record, path) => path.split('.').reduce((v, k) => Array.isArray(v) ? v.map(x => x?.[k]) : v?.[k], record);
  const matches = (record, filter) => Object.entries(filter).every(([key, expected]) => {
    const actual = read(record, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$ne' in expected) return Array.isArray(actual) ? !actual.includes(expected.$ne) : actual !== expected.$ne;
      if ('$elemMatch' in expected) return Array.isArray(actual) && actual.some(x => matches(x, expected.$elemMatch));
    }
    return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
  });
  const collection = name => {
    if (!collections.has(name)) collections.set(name, []);
    const items = collections.get(name);
    return {
      async findOne(filter) { return items.find(x => matches(x, filter)) ?? null; },
      find(filter) {
        let rows = items.filter(x => matches(x, filter));
        return {
          sort(spec) { const [key, direction] = Object.entries(spec || {})[0] || []; if (key) rows = rows.sort((a, b) => String(read(a,key)).localeCompare(String(read(b,key))) * direction); return this; },
          limit(n) { rows = rows.slice(0, n); return this; },
          async toArray() { return [...rows]; }
        };
      },
      async insertOne(value) { items.push(value); return { insertedId: value.id }; },
      async updateOne(filter, changes, options = {}) {
        let item = items.find(x => matches(x, filter));
        if (!item && options.upsert) {
          item = structuredClone(changes.$setOnInsert || filter);
          items.push(item);
        } else if (!item) return { modifiedCount: 0 };
        if (Array.isArray(changes)) {
          const field = changes[0].$set;
          const all = item.officerIds || [];
          const incoming = field.officerIds.$setUnion[1];
          const subtraction = field.officerIds.$setUnion[0].$setDifference?.[1] || [];
          item.officerIds = [...new Set([...all.filter(x => !subtraction.includes(x)), ...incoming])];
          if (field.ownerId) item.ownerId = field.ownerId;
        } else {
          Object.assign(item, changes.$setOnInsert && !item.id ? changes.$setOnInsert : {});
          if (changes.$set) {
            for (const [key, value] of Object.entries(changes.$set)) {
              if (key.startsWith('nominations.$.')) {
                const nom = item.nominations.find(n => n.memberId === filter.nominations.$elemMatch.memberId);
                nom[key.replace('nominations.$.', '')] = value;
              } else item[key] = value;
            }
          }
          for (const [key, value] of Object.entries(changes.$addToSet || {})) {
            item[key] ??= [];
            if (!item[key].includes(value)) item[key].push(value);
          }
          for (const [key, value] of Object.entries(changes.$push || {})) {
            item[key] ??= []; item[key].push(value);
          }
        }
        return { modifiedCount: 1 };
      }
    };
  };
  const user = (id, school = 'uni-a') => ({
    id, name: id, email: `${id}@example.test`, universityId: school,
    universityName: school === 'uni-a' ? 'A University' : 'B University',
    classification: 'sophomore', major: 'Computer Engineering',
    graduationYear: new Date().getUTCFullYear() + 3, clubIds: [], year: 2,
    skills: [], visibleToCompanies: false, openToNewClubs: false
  });
  for (const member of [user('alice'), user('bob'), user('outsider', 'uni-b')]) {
    collection('members').insertOne(member);
    collection('userProfiles').insertOne({
      id: `profile-${member.id}`, internalMemberId: member.id, authProvider: 'supabase',
      authProviderUserId: member.id, ...member, role: 'member', onboarded: true
    });
  }
  return {
    collections, collection,
    async command() { return { ok: 1 }; }
  };
}

test('real clubs, invitations, roster metrics and two-party officer succession', async t => {
  const db = createDatabase();
  const config = readConfig({
    AUTH_MODE: 'supabase', DATA_MODE: 'atlas', MONGODB_URI: 'mongodb://example',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    AUTH_ISSUER: 'https://example.supabase.co/auth/v1',
    AUTH_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    AUTH_AUDIENCE: 'authenticated', AI_MODE: 'mock'
  });
  const authentication = {
    verify: async req => {
      const token = (req.get('Authorization') || '').replace('Bearer ', '');
      if (!['alice', 'bob', 'outsider'].includes(token))
        throw Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHENTICATED' });
      return { sub: token, email: `${token}@example.test`, name: token };
    }
  };
  const app = createApp({ config, db, authentication });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (who, path, body, method='POST') => {
    const response = await fetch(origin + '/api' + path, {
      method: body === undefined ? 'GET' : method,
      headers: { Authorization: `Bearer ${who}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await call('bob', '/clubs')).data.data.length, 0);
  const created = await call('alice', '/organizations', { name: 'Robotics Society', description: 'Autonomous systems and firmware' });
  assert.equal(created.status, 201);
  const clubId = created.data.data.club.id;
  assert.ok(clubId.startsWith('club-'));
  assert.equal((await call('alice', '/clubs')).data.data.length, 1);
  assert.equal((await call('bob', `/organizations/${clubId}/roster-stats`)).status, 404);
  assert.equal((await call('alice', `/organizations/${clubId}/invitations`, { memberId: 'outsider' })).status, 404);
  const invitation = await call('alice', `/organizations/${clubId}/invitations`, { memberId: 'bob' });
  assert.equal(invitation.status, 201);
  const inviteId = invitation.data.data.invitation.id;
  assert.equal((await call('bob', '/organizations/invitations')).data.data.length, 1);
  assert.equal((await call('outsider', `/organizations/invitations/${inviteId}/respond`, { action:'accept' })).status, 404);
  assert.equal((await call('bob', `/organizations/invitations/${inviteId}/respond`, { action:'accept' })).status, 200);
  assert.equal((await call('bob', '/clubs')).data.data.length, 1);
  const roster = await call('alice', `/organizations/${clubId}/roster-stats`);
  assert.deepEqual(roster.data.data.members.map(x => x.name).sort(), ['alice', 'bob']);
  assert.equal(roster.data.data.members.every(x => x.points === 0), true);
  const role = await call('alice', `/organizations/${clubId}/succession`, {
    title:'Firmware Lead', description:'Lead board bring-up and mentor the next cohort', skills:['CAN','C++']
  });
  assert.equal(role.status, 201);
  const roleId = role.data.data.role.id;
  assert.equal((await call('bob', `/organizations/${clubId}/succession`)).status, 403);
  assert.equal((await call('alice', `/organizations/${clubId}/succession/${roleId}/nominate`, { memberId:'bob' })).status, 200);
  assert.equal((await call('bob', '/organizations/succession-offers')).data.data.length, 1);
  assert.equal((await call('alice', `/organizations/${clubId}/succession/${roleId}/appoint`, { memberId:'bob' })).status, 409);
  assert.equal((await call('bob', `/organizations/${clubId}/succession/${roleId}/respond`, { action:'accept' })).status, 200);
  assert.equal((await call('alice', `/organizations/${clubId}/succession/${roleId}/appoint`, { memberId:'bob' })).status, 200);
  assert.equal((await call('bob', `/organizations/${clubId}/succession`)).status, 200);
  assert.equal((await call('outsider', `/organizations/${clubId}/succession`)).status, 404);
});
