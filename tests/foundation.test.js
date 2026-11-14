import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readConfig } from '../backend/config.js';
import { createApp } from '../backend/app.js';
import { createRepository } from '../backend/repositories/records.js';
import { contributionPoints, semesterOf, validateReviewer, weekStart } from '../backend/services/scoring.js';
import { universityContributorsPipeline, universityTotalsPipeline } from '../database/aggregations.js';
import { validateExtraction, validateFit } from '../ai-service/schemas.js';
import { createGeminiService } from '../ai-service/gemini.js';
import { extractNotes } from '../backend/middleware/uploads.js';
import { fixtures } from '../demo-data/fixtures.js';
import { indexes, setupCollections } from '../database/definitions.js';
const config = readConfig({ DATA_MODE: 'demo', AI_MODE: 'mock' });

test('credentialless mode is explicit; live modes cannot silently fall back', () => {
  assert.equal(readConfig({}).DATA_MODE, 'demo');
  assert.throws(() => readConfig({ DATA_MODE: 'atlas' }), /MONGODB_URI/);
  assert.throws(() => readConfig({ AI_MODE: 'live' }), /GEMINI_API_KEY/);
  assert.throws(() => createApp({ config: { ...config, DATA_MODE: 'atlas' } }), /connected database/);
});
test('scoring and reviewer boundaries', () => {
  assert.deepEqual(['low', 'medium', 'high'].map(l => contributionPoints(l)), [30, 60, 90]);
  for (const points of [10, 40, 100]) assert.equal(contributionPoints('custom', points), points);
  for (const points of [0, 15, 101, 110, '40', 40.5]) assert.throws(() => contributionPoints('custom', points));
  assert.throws(() => contributionPoints('unknown'));
  assert.throws(() => contributionPoints('toString'));
  assert.throws(() => validateReviewer({ memberId: 'a', reviewerId: 'a', officerIds: ['a'] }));
  assert.throws(() => validateReviewer({ memberId: 'a', reviewerId: 'b', officerIds: ['c'] }));
  assert.doesNotThrow(() => validateReviewer({ memberId: 'a', reviewerId: 'b', officerIds: ['b'] }));
  assert.equal(weekStart('2026-11-15'), '2026-11-09');
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
  assert.throws(() => weekStart('2026-02-30'));
});
test('fixtures preserve attendance uniqueness, source evidence and review integrity', () => {
  const keys = fixtures.attendance.map(a => `${a.sessionId}/${a.memberId}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const entry of fixtures.contributions) {
    assert.notEqual(entry.memberId, entry.approvedBy);
    assert.equal(entry.points, contributionPoints(entry.level));
    assert.ok(fixtures.clubs.find(c => c.id === entry.clubId).officerIds.includes(entry.approvedBy));
    assert.ok(entry.source.excerpt.includes(entry.description));
  }
  assert.ok(indexes.attendance.some(i => i.unique && i.key.sessionId && i.key.memberId));
});
test('Athena rejects fabricated evidence, unknown attribution and model-awarded points', () => {
  const notes = 'Leo Marin validated CAN messages.';
  const input = { notes, roster: [{ id: 'member-leo', name: 'Leo Marin' }] };
  const draft = { memberId: 'member-leo', memberName: 'Leo Marin', description: 'Validated CAN messages.', skills: ['CAN'], suggestedLevel: 'medium', sourceExcerpt: notes, uncertainty: '' };
  assert.equal(validateExtraction({ drafts: [draft] }, input).drafts.length, 1);
  assert.throws(() => validateExtraction({ drafts: [{ ...draft, sourceExcerpt: 'Invented evidence' }] }, input));
  assert.throws(() => validateExtraction({ drafts: [{ ...draft, memberId: 'unknown' }] }, input));
  assert.throws(() => validateExtraction({ drafts: [{ ...draft, points: 90 }] }, input));
  assert.throws(() => validateExtraction({ drafts: [{ ...draft, sourceExcerpt: 'validated CAN messages.' }] }, input));
  assert.equal(validateExtraction({ drafts: [{ ...draft, memberId: null, memberName: 'Unclear name' }] }, input).drafts[0].memberId, null);
});
test('Bow requires grounded candidate-owned evidence and explicit consent', async () => {
  const output = { candidateId: 'a', strengths: [{ explanation: 'CAN work', evidenceId: 'c1', sourceExcerpt: 'Tested CAN' }], gaps: ['Mentoring unknown'], reviewRequired: true };
  assert.doesNotThrow(() => validateFit(output, { candidateId: 'a', evidence: [{ id: 'c1', text: 'Tested CAN messages.' }] }));
  assert.throws(() => validateFit(output, { candidateId: 'b', evidence: [] }));
  assert.throws(() => validateFit(output, { candidateId: 'a', evidence: [{ id: 'c1', text: 'Unrelated' }] }));
  const service = createGeminiService(config);
  await assert.rejects(service.explainCandidateFit({ consent: false }), /opt in/);
  await assert.rejects(service.explainCandidateFit({ consent: true, candidateId: 'a', role: 'Lead', evidence: [{ memberId: 'b', kind: 'approved-contribution', text: 'Test' }] }), /candidate-owned/);
  const mock = await service.extractContributions({ notes: 'Meeting notes', roster: [] });
  assert.equal(mock.origin, 'mock'); assert.deepEqual(mock.drafts, []);
});
test('upload utility accepts text and rejects empty notes and bogus PDFs', async () => {
  assert.equal(await extractNotes({ mimetype: 'text/plain', buffer: Buffer.from('Fictional notes') }), 'Fictional notes');
  await assert.rejects(extractNotes({ mimetype: 'text/plain', buffer: Buffer.from(' ') }), /1–50,000/);
  await assert.rejects(extractNotes({ mimetype: 'application/pdf', buffer: Buffer.from('not pdf') }), /signature/);
});
test('HTTP frontend, API, ranking, discovery privacy, validation and planned routes', async t => {
  const server = createApp({ config }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async path => (await fetch(base + path)).json();
  const health = await get('/api/health');
  assert.equal(health.meta.mode, 'demo'); assert.equal(health.data.status, 'ok');
  const html = await (await fetch(base)).text();
  for (const label of ['Ithaca Home', 'Athena', 'Kleos Ledger', 'The Court', 'Bow']) assert.ok(html.includes(label));
  for (const path of ['/app.js', '/styles.css', '/shared/api.js', '/core/home.js', '/recruiting/court.js']) assert.equal((await fetch(base + path)).status, 200);
  const all = await get('/api/clubs/club-rocketry/rankings?range=all');
  assert.deepEqual(all.data.rows.map(r => r.points), [280, 250, 130]);
  const week = await get('/api/clubs/club-rocketry/rankings?range=week');
  assert.equal(week.data.rows[0].points, 70);
  const discovery = await get('/api/recruiter/profiles');
  assert.ok(!discovery.data.some(p => p.member.id === 'member-sana'));
  assert.ok(discovery.data.every(p => !('email' in p.member) && !('visibleToCompanies' in p.member)));
  assert.equal((await fetch(base + '/api/recruiter/profiles/member-sana')).status, 404);
  assert.equal((await get('/api/recruiter/profiles?skill=CAN')).data.length, 1);
  assert.equal((await fetch(base + '/api/clubs/club-rocketry/rankings?range=invalid')).status, 400);
  assert.equal((await fetch(base + '/api/clubs/missing/roster')).status, 404);
  assert.equal((await fetch(base + '/api/no-route')).status, 404);
  const planned = await fetch(base + '/api/contributions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(planned.status, 501);
  assert.equal((await planned.json()).error.code, 'NOT_IMPLEMENTED');
  const invalid = await fetch(base + '/api/contributions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  // Execute all browser view modules against the actual HTTP API without a DOM.
  // This verifies fetch/render integration; it does not replace visual browser QA.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => originalFetch(new URL(url, base), options);
  try {
    const views = await Promise.all([
      import('../frontend/core/home.js'), import('../frontend/core/athena.js'),
      import('../frontend/core/kleos.js'), import('../frontend/recruiting/court.js'),
      import('../frontend/recruiting/bow.js'), import('../frontend/core/member.js')
    ]);
    const renderers = [views[0].renderHome, views[1].renderAthena, views[2].renderKleos, views[3].renderCourt, views[4].renderBow, () => views[5].renderMember('member-leo')];
    const output = await Promise.all(renderers.map(render => render()));
    for (const page of output) { assert.ok(page.includes('<h1>')); assert.ok(!page.includes('undefined')); }
    assert.ok(output[0].includes('660'));
    assert.ok(!output[0].includes('Meridian'), 'Home stays scoped to Aster clubs');
    assert.ok(output[2].includes('href="#member/member-leo"'), 'ranking names link to member stats');
    assert.ok(output[2].includes('Semester by semester'), 'default demo identity is an officer');
    assert.ok(output[2].includes('Universities by contributions'));
    assert.ok(output[5].includes('Leo Marin') && output[5].includes('Fall 2026') && output[5].includes('Spring 2026'));
    assert.ok(output[1].includes('Approve · planned'));
    assert.ok(!output[3].includes('Sana Reed'));
    assert.ok((await views[2].renderKleos('week')).includes('70'));
    assert.ok((await views[3].renderCourt('no-such-skill')).includes('No opted-in profiles'));
  } finally { globalThis.fetch = originalFetch; }
});
test('Kleos Ledger: member stats, officer semesters, member requests, university leaderboards', async t => {
  const server = createApp({ config }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { as, method = 'GET', body } = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(as ? { 'X-Demo-Member': as } : {}) }, body: body && JSON.stringify(body) });
  // Member stats
  const leo = (await (await call('/api/members/member-leo')).json()).data.stats;
  assert.equal(leo.totalPoints, 280); assert.equal(leo.contributionCount, 3); assert.equal(leo.attendanceCount, 4);
  assert.deepEqual(leo.clubs[0], { clubId: 'club-rocketry', name: 'Aster Rocketry', officer: true, rank: 1, of: 3, points: 280 });
  assert.deepEqual(leo.semesters.map(s => [s.label, s.contributions, s.points]), [['Fall 2026', 2, 190], ['Spring 2026', 1, 90]]);
  assert.equal(leo.skills[0].skill, 'C firmware');
  // Officer-only semester view
  assert.equal((await call('/api/clubs/club-rocketry/semesters')).status, 401);
  assert.equal((await call('/api/clubs/club-rocketry/semesters', { as: 'member-sana' })).status, 403);
  assert.equal((await call('/api/clubs/club-rocketry/semesters', { as: 'member-nora' })).status, 403, 'officer of another club');
  const history = (await (await call('/api/clubs/club-rocketry/semesters', { as: 'member-iris' })).json()).data;
  assert.deepEqual(history.semesters.map(s => [s.label, s.contributions]), [['Fall 2026', 4], ['Spring 2026', 3], ['Fall 2025', 1]]);
  assert.equal(history.semesters[0].members[0].memberId, 'member-leo');
  // Member contribution requests
  const valid = { description: 'Rewrote the parachute deployment checklist.', evidence: 'Session 4 notes: Sana walked the team through the new checklist.', skills: ['Recovery systems'], suggestedLevel: 'low', date: '2026-11-10' };
  assert.equal((await call('/api/clubs/club-rocketry/contribution-requests', { method: 'POST', body: valid })).status, 401);
  assert.equal((await call('/api/clubs/club-rocketry/contribution-requests', { as: 'member-iris', method: 'POST', body: valid })).status, 403, 'officers do not file member requests');
  assert.equal((await call('/api/clubs/club-rocketry/contribution-requests', { as: 'member-ada', method: 'POST', body: valid })).status, 403, 'non-members cannot request');
  for (const bad of [{ ...valid, description: 'short' }, { ...valid, date: '2026-02-30' }, { ...valid, date: '2999-01-01' }, { ...valid, points: 90 }, { ...valid, suggestedLevel: 'custom' }]) {
    assert.equal((await call('/api/clubs/club-rocketry/contribution-requests', { as: 'member-sana', method: 'POST', body: bad })).status, 400, JSON.stringify(bad));
  }
  const created = await call('/api/clubs/club-rocketry/contribution-requests', { as: 'member-sana', method: 'POST', body: valid });
  assert.equal(created.status, 201);
  const draft = (await created.json()).data;
  assert.equal(draft.memberId, 'member-sana'); assert.equal(draft.status, 'pending'); assert.equal(draft.origin, 'member-request'); assert.ok(!('points' in draft));
  const mine = (await (await call('/api/clubs/club-rocketry/contribution-requests', { as: 'member-sana' })).json()).data;
  assert.ok(mine.some(d => d.id === draft.id));
  assert.equal((await (await call('/api/clubs/club-rocketry/semesters', { as: 'member-leo' })).json()).data.pendingRequests, 1);
  assert.equal((await (await call('/api/members/member-sana')).json()).data.stats.totalPoints, 130, 'requests award no points');
  // University leaderboards
  const totals = (await (await call('/api/universities')).json()).data;
  assert.deepEqual(totals.map(u => [u.universityId, u.contributions, u.rank]), [['uni-aster', 10, 1], ['uni-meridian', 5, 2]]);
  const aster = (await (await call('/api/universities/uni-aster/leaderboard')).json()).data;
  assert.deepEqual(aster.rows.slice(0, 2).map(r => [r.memberId, r.contributions, r.rank]), [['member-leo', 3, 1], ['member-iris', 3, 2]]);
  assert.ok(aster.rows.every(r => r.clubs.length && r.memberId !== 'member-ada'));
  assert.equal((await call('/api/universities/uni-missing/leaderboard')).status, 404);
});
test('university leaderboard pipelines match the demo repository contract', () => {
  const contributors = universityContributorsPipeline('uni-aster');
  assert.deepEqual(contributors[0], { $match: { universityId: 'uni-aster', status: 'approved' } });
  assert.ok(contributors.some(stage => stage.$sort?.contributions === -1));
  assert.ok(universityTotalsPipeline().some(stage => stage.$lookup?.from === 'universities'));
  assert.deepEqual(['2026-01-15', '2026-06-01', '2026-08-24', '2026-12-31'].map(d => semesterOf(d).label), ['Spring 2026', 'Summer 2026', 'Fall 2026', 'Fall 2026']);
  assert.throws(() => semesterOf('2026-13-01'));
});
test('Atlas failures propagate instead of returning fixtures', async t => {
  const db = { collection() { throw new Error('Simulated outage'); }, async command() { throw new Error('Simulated outage'); } };
  await assert.rejects(createRepository(db).list('clubs'), /outage/);
  const server = createApp({ config: { ...config, DATA_MODE: 'atlas' }, db }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/health')).status, 503);
  const result = await fetch(base + '/api/clubs');
  assert.equal(result.status, 500); assert.ok(!('data' in await result.json()));
});
test('setup creates all 11 collections and attendance duplicate guard', async () => {
  const created = [], installed = [];
  const db = { listCollections: () => ({ toArray: async () => [] }), createCollection: async (name, options) => created.push({ name, options }), collection: name => ({ createIndex: async (key, options) => installed.push({ name, key, options }) }) };
  await setupCollections(db);
  assert.equal(created.length, 11);
  assert.ok(created.every(c => c.options.validationAction === 'error'));
  assert.ok(installed.some(i => i.name === 'attendance' && i.key.sessionId && i.key.memberId && i.options.unique));
});
test('Git excludes environment secrets and uploads, but keeps the template', () => {
  const ignored = execFileSync('git', ['check-ignore', '--stdin'], { input: '.env\n.env.production\nuploads/notes.pdf\n.env.example\n', encoding: 'utf8' });
  assert.ok(ignored.includes('.env.production')); assert.ok(ignored.includes('uploads/notes.pdf')); assert.ok(!ignored.includes('.env.example'));
});
