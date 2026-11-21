import test from 'node:test';
import assert from 'node:assert/strict';
import { requireVerifiedMemberId } from '../backend/auth/identity.js';
import { requireClubMember, requireOfficer, requireProjectLead } from '../backend/services/authorization.js';

const request = memberId => ({ memberId, authProfile: {
  authProvider: 'supabase', internalMemberId: memberId, authProviderUserId: memberId,
  clubIds: ['club-a', 'club-b'] // This cached claim must never determine access.
} });
const records = {
  members: [{ id: 'member-a', supabaseUserId: 'member-a', clubIds: ['club-a'], universityId: 'uni-a' },
    { id: 'officer', supabaseUserId: 'officer', clubIds: ['club-a'], universityId: 'uni-a' },
    { id: 'revoked', supabaseUserId: 'revoked', clubIds: [], universityId: 'uni-a' },
    { id: 'different-school', supabaseUserId: 'different-school', clubIds: ['club-a'], universityId: 'uni-b' }],
  clubs: [{ id: 'club-a', universityId: 'uni-a', officerIds: ['officer', 'revoked'] },
    { id: 'club-b', universityId: 'uni-b', officerIds: ['officer'] }],
  clubProjects: [{ id: 'project-a', clubId: 'club-a', leadIds: ['member-a'] },
    { id: 'project-b', clubId: 'club-b', leadIds: ['member-a'] }]
};
const db = { collection: name => ({ findOne: async where => records[name].find(row =>
  Object.entries(where).every(([key, value]) => row[key] === value)) ?? null }) };

test('identity requires Supabase middleware context and rejects forged identifiers', () => {
  assert.equal(requireVerifiedMemberId(request('member-a')), 'member-a');
  for (const bad of [
    { memberId: 'member-a' },
    { ...request('member-a'), memberId: 'officer' },
    { ...request('member-a'), authProfile: { ...request('member-a').authProfile, authProvider: 'demo' } },
    { ...request('member-a'), authProfile: { ...request('member-a').authProfile, internalMemberId: 'officer' } },
    { ...request('member-a'), body: { memberId: 'officer', role: 'admin' }, authProfile: null }
  ]) assert.throws(() => requireVerifiedMemberId(bad), { status: 401 });
});

test('club membership is freshly validated against stored member and club', async () => {
  const access = await requireClubMember(request('member-a'), db, 'club-a');
  assert.equal(access.actor.id, 'member-a');
  for (const [who, clubId] of [['member-a','club-b'], ['revoked','club-a'],
    ['different-school','club-a'], ['member-a','missing']]) {
    await assert.rejects(requireClubMember(request(who), db, clubId), { status: 404 });
  }
  await assert.rejects(requireClubMember({ ...request('member-a'), memberId: 'officer' }, db, 'club-a'), { status: 401 });
});

test('revoked officer and ordinary member are denied officer authority', async () => {
  assert.equal((await requireOfficer(request('officer'), db, 'club-a')).actor.id, 'officer');
  await assert.rejects(requireOfficer(request('member-a'), db, 'club-a'), { status: 403, code: 'OFFICER_REQUIRED' });
  await assert.rejects(requireOfficer(request('revoked'), db, 'club-a'), { status: 404 });
  await assert.rejects(requireOfficer(request('officer'), db, 'club-b'), { status: 404 });
});

test('lead is scoped to stored project and cannot inherit lead on another club project', async () => {
  assert.equal((await requireProjectLead(request('member-a'), db, 'club-a', 'project-a')).isProjectLead, true);
  assert.equal((await requireProjectLead(request('officer'), db, 'club-a', 'project-a')).isOfficer, true);
  await assert.rejects(requireProjectLead(request('member-a'), db, 'club-b', 'project-b'), { status: 404 });
  await assert.rejects(requireProjectLead(request('member-a'), db, 'club-a', 'project-b'), { status: 404 });
  await assert.rejects(requireProjectLead(request('revoked'), db, 'club-a', 'project-a'), { status: 404 });
});
