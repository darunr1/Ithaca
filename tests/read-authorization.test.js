import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readRoutes } from '../backend/routes/read.js';
import { createWorkspace } from '../backend/services/workspace.js';

const rows = {
  clubs: [{ id: 'club-a', name: 'A', universityId: 'uni-a', officerIds: ['officer'] },
    { id: 'club-b', name: 'B', universityId: 'uni-a', officerIds: ['other'] }],
  members: [
    { id: 'officer', name: 'Officer', email: 'officer@example.test', clubIds: ['club-a'], universityId: 'uni-a', skills: [] },
    { id: 'alice', name: 'Alice', email: 'alice@example.test', visibleToCompanies: false, clubIds: ['club-a'], universityId: 'uni-a', skills: [] },
    { id: 'bob', name: 'Bob', email: 'bob@example.test', visibleToCompanies: false, clubIds: ['club-a', 'club-b'], universityId: 'uni-a', skills: [] },
    { id: 'other', name: 'Other', email: 'other@example.test', clubIds: ['club-b'], universityId: 'uni-a', skills: [] },
    { id: 'revoked', name: 'Revoked', clubIds: [], universityId: 'uni-a', skills: [] }
  ],
  drafts: [{ id: 'draft-a', clubId: 'club-a', memberId: 'bob', source: { excerpt: 'private request' } }],
  sessions: [{ id: 'session-a', clubId: 'club-a', title: 'Meeting' }],
  attendance: [{ id: 'attendance-a', clubId: 'club-b', memberId: 'bob', points: 12, date: '2026-11-11' }],
  contributions: [{ id: 'contribution-a', clubId: 'club-b', memberId: 'bob', points: 100, status: 'approved', skills: [], date: '2026-11-11' }]
};
const repository = {
  async one(collection, id) { return rows[collection]?.find(r => r.id === id) ?? null; },
  async list(collection, filter = {}) { return (rows[collection] || []).filter(r => Object.entries(filter).every(([k,v]) => Array.isArray(r[k]) ? r[k].includes(v) : r[k] === v)); },
  async history(memberId) { return rows.contributions.filter(r => r.memberId === memberId); },
  async rankings() { return [] }
};
const db = { collection: name => ({ findOne: async where => rows[name]?.find(r => Object.entries(where).every(([k,v]) => r[k] === v)) ?? null }) };

test('production read endpoints do not disclose another club’s member history or pending drafts', async t => {
  const app = express();
  app.use((req, res, next) => {
    const who = req.headers.authorization?.replace('Bearer ', '');
    req.memberId = who;
    req.authProfile = { authProvider: 'supabase', authProviderUserId: who, internalMemberId: who,
      clubIds: ['club-a', 'club-b'] /* stale profile must not grant access */ };
    next();
  });
  const workspace = createWorkspace(repository);
  app.use('/api', readRoutes({ repository, workspace, db, config: { AUTH_MODE: 'supabase', DATA_MODE: 'atlas' },
    send: (res,data) => res.json({ data }) }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: { code: error.code } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const get = async (who, path) => {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path,
      { headers: { Authorization: 'Bearer ' + who } });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await get('revoked', '/clubs/club-a/roster')).status, 404);
  assert.equal((await get('other', '/clubs/club-a/sessions')).status, 404);
  assert.equal((await get('alice', '/clubs/club-a/drafts')).status, 403);
  assert.equal((await get('officer', '/clubs/club-a/drafts')).status, 200);
  assert.equal((await get('officer', '/clubs/club-b/drafts')).status, 404);
  const roster = (await get('alice', '/clubs/club-a/roster')).body.data;
  assert.equal(roster.some(r => 'email' in r), false);
  assert.deepEqual(roster.find(r => r.id === 'bob').clubIds, ['club-a']);
  const profile = await get('alice', '/members/bob');
  assert.equal(profile.status, 200);
  assert.deepEqual(profile.body.data.member.clubIds, ['club-a']);
  assert.equal('email' in profile.body.data.member, false);
  assert.deepEqual(profile.body.data.contributions, []);
  assert.deepEqual(profile.body.data.attendance, []);
  assert.equal(profile.body.data.stats.totalPoints, 0);
  assert.equal((await get('alice', '/members/other')).status, 404);
  assert.equal((await get('revoked', '/members/bob')).status, 404);
  const own = await get('bob', '/members/bob');
  assert.equal(own.body.data.member.email, 'bob@example.test');
  assert.equal(own.body.data.stats.totalPoints, 112);
});
