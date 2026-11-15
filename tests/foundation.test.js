import test from 'node:test';
import { parseCsv } from '../backend/services/discovery-options.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readConfig } from '../backend/config.js';
import { createApp } from '../backend/app.js';
import { createRepository } from '../backend/repositories/records.js';
import { contributionPoints, parseTerm, semesterOf, termsThrough, validateReviewer, weekStart } from '../backend/services/scoring.js';
import { universityContributorsPipeline, universityTotalsPipeline } from '../database/aggregations.js';
import { extractionJsonSchema, validateExtraction, validateFit } from '../ai-service/schemas.js';
import { createGeminiService, geminiJsonSchema } from '../ai-service/gemini.js';
import { extractNotes } from '../backend/middleware/uploads.js';
import { fixtures } from '../demo-data/fixtures.js';
import { indexes, setupCollections } from '../database/definitions.js';
import { readFileSync } from 'node:fs';
const config = readConfig({ DATA_MODE: 'demo', AI_MODE: 'mock' });

test('Vercel deployment routes API functions and frontend assets', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  assert.deepEqual(vercel.rewrites.slice(0, 2), [
    { source: '/api/(.*)', destination: '/api/index.js' },
    { source: '/', destination: '/index.html' }
  ]);
  assert.equal(vercel.outputDirectory, 'frontend');
  assert.deepEqual(vercel.rewrites.slice(2), [
    { source: '/dashboard', destination: '/app.html' },
    { source: '/app', destination: '/app.html' },
    { source: '/login', destination: '/login.html' },
    { source: '/signup', destination: '/signup.html' },
    { source: '/forgot-password', destination: '/forgot-password.html' },
    { source: '/reset-password', destination: '/reset-password.html' }
  ]);
});

test('credentialless mode is explicit; live modes cannot silently fall back', () => {
  assert.equal(readConfig({}).DATA_MODE, 'demo');
  assert.throws(() => readConfig({ DATA_MODE: 'atlas' }), /MONGODB_URI/);
  assert.throws(() => readConfig({ AI_MODE: 'live' }), /GEMINI_API_KEY/);
  assert.throws(() => createApp({ config: { ...config, DATA_MODE: 'atlas' } }), /connected database/);
});
test('Gemini receives its supported schema subset while Zod retains strict validation', () => {
  const schema = geminiJsonSchema(extractionJsonSchema);
  assert.equal(schema.$schema, undefined);
  assert.equal(schema.additionalProperties, undefined);
  assert.equal(schema.properties.drafts.maxItems, undefined);
  assert.deepEqual(schema.properties.drafts.items.properties.memberId.type, ['string', 'null']);
  assert.deepEqual(schema.properties.drafts.items.properties.suggestedLevel.enum, ['low', 'medium', 'high']);
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
  assert.ok(html.includes('Engineering legacies deserve to be remembered.'));
  const workspaceHtml = await (await fetch(base + '/app.html')).text();
  for (const label of ['Ithaca Home', 'Athena', 'Kleos Ledger', 'The Court', 'Bow']) assert.ok(workspaceHtml.includes(label));
  assert.equal((await fetch(base + '/dashboard')).status, 200);
  for (const [path, marker] of [['/login', 'Log in'], ['/signup', 'Create account'], ['/forgot-password', 'Send reset link'], ['/reset-password', 'Update password']]) {
    const response = await fetch(base + path); assert.equal(response.status, 200); assert.ok((await response.text()).includes(marker));
  }
  for (const path of ['/landing.css', '/workspace.js', '/supabase.js', '/vendor/supabase.js', '/app.js', '/styles.css', '/shared/api.js', '/core/home.js', '/recruiting/court.js']) assert.equal((await fetch(base + path)).status, 200);
  const all = await get('/api/clubs/club-rocketry/rankings?range=all');
  assert.deepEqual(all.data.rows.map(r => r.points), [280, 250, 130]);
  const week = await get('/api/clubs/club-rocketry/rankings?range=week');
  assert.equal(week.data.rows[0].points, 70);
  assert.deepEqual(week.data.terms.map(t => t.id), ['2026-spring', '2026-summer', '2026-fall', '2026-winter']);
  assert.deepEqual((await get('/api/clubs/club-rocketry/rankings?range=2026-fall')).data.rows.map(r => r.points), [190, 130, 100]);
  assert.deepEqual((await get('/api/clubs/club-rocketry/rankings?range=2026-spring')).data.rows.map(r => r.points), [90, 60, 30]);
  assert.deepEqual((await get('/api/clubs/club-rocketry/rankings?range=2026-winter')).data.rows, []);
  assert.equal((await fetch(base + '/api/clubs/club-rocketry/rankings?range=2026-autumn')).status, 400);
  const options = await get('/api/recruiter/discovery-options');
  assert.equal(options.data.state.length, 50);
  assert.ok(options.data.state.includes('Texas'));
  assert.ok(options.data.major.includes('Mechanical Engineering'));
  assert.ok(options.data.club.includes('National Society of Black Engineers'));
  assert.equal(new Set(options.data.club).size, options.data.club.length);
  assert.ok(options.data.university.includes('Aaniiih Nakoda College'));
  assert.ok(options.data.university.length > 4000);
  assert.equal(new Set(options.data.university).size, options.data.university.length);
  const discovery = await get('/api/recruiter/profiles');
  assert.ok(!discovery.data.some(p => p.member.id === 'member-sana'));
  assert.ok(discovery.data.every(p => !('email' in p.member) && !('visibleToCompanies' in p.member)));
  assert.equal((await fetch(base + '/api/recruiter/profiles/member-sana')).status, 404);
  assert.equal((await get('/api/recruiter/profiles?skill=CAN')).data.length, 1);
  for (const [query, ids] of [
    ['name=LEO', ['member-leo']],
    ['major=electrical', ['member-iris', 'member-nora']],
    ['university=aster', ['member-iris', 'member-leo', 'member-nora', 'member-eli']],
    ['year=4', ['member-iris', 'member-tomas']],
    ['club=racing', ['member-nora']],
    ['name=leo&skill=can&major=computer&university=aster&year=3&club=rocketry', ['member-leo']],
    ['name=leo&year=4', []],
    ['name=sana', []],
    ['state=texas&name=leo', ['member-leo']],
    ['state=california', []],
    ['state=%20TEXAS%20&year=4', ['member-iris']],
    ['university=missing', []]
  ]) assert.deepEqual((await get(`/api/recruiter/profiles?${query}`)).data.map(p => p.member.id), ids);
  for (const query of ['year=abc', 'year=0', 'year=5', 'year=3.5', 'name=a&name=b', `major=${'a'.repeat(81)}`]) {
    assert.equal((await fetch(`${base}/api/recruiter/profiles?${query}`)).status, 400);
  }
  assert.deepEqual(discovery.data[0].university, { id: 'uni-aster', name: 'Aster University', state: 'Texas' });
  assert.deepEqual(discovery.data[0].clubs, [{ id: 'club-rocketry', name: 'Aster Rocketry' }]);

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
    assert.ok(output[1].includes('Ask Athena'));
    assert.ok(output[1].includes('Upload documents'));
    assert.ok(!output[1].includes('Proposed contributions'));
    assert.ok(output[0].includes('660'));
    assert.ok(!output[0].includes('Meridian'), 'Home stays scoped to Aster clubs');
    assert.ok(output[2].includes('href="#member/member-leo"'), 'ranking names link to member stats');
    assert.ok(output[2].includes('Semester by semester'), 'default demo identity is an officer');
    assert.ok(!output[2].includes('Most contributions') && !output[2].includes('Universities by contributions'), 'leaderboard panels removed');
    assert.ok(output[5].includes('Leo Marin') && output[5].includes('Fall 2026') && output[5].includes('Spring 2026'));
    assert.ok(!output[3].includes('Sana Reed'));
    assert.ok((await views[2].renderKleos('week')).includes('70'));
    const termPage = await views[2].renderKleos('2026-spring');
    assert.ok(termPage.includes('<option value="2026-spring" selected>Spring 2026</option>') && termPage.includes('Winter 2026') && !termPage.includes('>Semester</option>'));
    assert.ok((await views[3].renderCourt('no-such-skill')).includes('No opted-in profiles'));
    const filteredCourt = await views[3].renderCourt({ name: 'Leo', year: '3', club: 'rocketry' });
    assert.ok(filteredCourt.includes('1 student found'));
    for (const label of ['Freshman', 'Sophomore', 'Junior', 'Senior']) assert.ok(filteredCourt.includes(label));
    assert.ok(!filteredCourt.includes('value="5"'));
    assert.ok(filteredCourt.includes('>Junior</option>'));
    assert.ok(filteredCourt.includes('id="court-skill-options" class="court-options" role="listbox"'));
    assert.ok(filteredCourt.includes('data-value="Texas"'));
    assert.ok(filteredCourt.includes('data-value="CAN"'));
    assert.ok(filteredCourt.includes('data-value="National Society of Black Engineers"'));
    assert.ok(filteredCourt.includes('data-value="Aster Rocketry"'));
    assert.ok(filteredCourt.includes('data-value="Iris Vale"'));
    assert.ok(!filteredCourt.includes('data-value="Sana Reed"'));
    assert.ok(filteredCourt.includes('Leo Marin'));
    assert.ok(!filteredCourt.includes('<h2>Iris Vale</h2>'));
    for (const field of ['name', 'skill', 'major', 'university', 'year', 'club', 'state']) assert.ok(filteredCourt.includes(`name="${field}"`));
    assert.ok((await views[3].renderCourt({ name: '<script>' })).includes('&lt;script&gt;'));

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
  const officerView = (await (await call('/api/clubs/club-rocketry/semesters', { as: 'member-leo' })).json()).data;
  assert.equal(officerView.pendingRequests, 1);
  assert.deepEqual([officerView.requests[0].id, officerView.requests[0].name, officerView.requests[0].evidence], [draft.id, 'Sana Reed', valid.evidence]);
  // Officers review requests in the ledger itself, not via a link out to Athena
  globalThis.localStorage = { getItem: () => 'member-leo', setItem() {} };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => realFetch(new URL(url, base), opts);
  try {
    const { renderKleos } = await import('../frontend/core/kleos.js');
    const page = await renderKleos();
    assert.ok(page.includes('id="pending-requests"') && page.includes(valid.description));
    assert.ok(!page.includes('href="#athena"'));
  } finally { globalThis.fetch = realFetch; delete globalThis.localStorage; }
  assert.equal((await (await call('/api/members/member-sana')).json()).data.stats.totalPoints, 130, 'requests award no points');
  // University leaderboards
  const totals = (await (await call('/api/universities')).json()).data;
  assert.deepEqual(totals.map(u => [u.universityId, u.contributions, u.rank]), [['uni-aster', 10, 1], ['uni-meridian', 5, 2]]);
  const aster = (await (await call('/api/universities/uni-aster/leaderboard')).json()).data;
  assert.deepEqual(aster.rows.slice(0, 2).map(r => [r.memberId, r.contributions, r.rank]), [['member-leo', 3, 1], ['member-iris', 3, 2]]);
  assert.ok(aster.rows.every(r => r.clubs.length && r.memberId !== 'member-ada'));
  assert.equal((await call('/api/universities/uni-missing/leaderboard')).status, 404);
  // College search: directory + Ithaca universities, forgiving input
  const search = async q => (await (await call(`/api/colleges/search?q=${encodeURIComponent(q)}`)).json()).data;
  assert.equal((await search('UT Arlington'))[0].name, 'University of Texas at Arlington');
  assert.equal((await search('uta'))[0].name, 'University of Texas at Arlington');
  assert.equal((await search('MIT'))[0].name, 'Massachusetts Institute of Technology');
  assert.equal((await search('stanferd'))[0].name, 'Stanford University', 'one-letter typo');
  assert.equal((await search('texas a&m'))[0].name, 'Texas A&M University');
  const asterHit = (await search('aster'))[0];
  assert.deepEqual([asterHit.id, asterHit.registered], ['uni-aster', true], 'Ithaca universities are searchable and ranked first');
  assert.deepEqual(await search(''), []);
  assert.deepEqual(await search('zzzzqqq'), []);
  const uta = (await search('UT Arlington'))[0];
  const utaBoard = (await (await call(`/api/universities/${uta.id}/leaderboard`)).json()).data;
  assert.deepEqual([utaBoard.university.name, utaBoard.university.location, utaBoard.university.registered, utaBoard.rows.length], ['University of Texas at Arlington', 'Texas, United States of America', false, 0]);
  // Most contributions: club (national organization), college and major filters
  const options = (await (await call('/api/leaderboard/filters')).json()).data;
  assert.equal(options.organizations.length, 15); assert.equal(options.majors.length, 23);
  assert.ok(options.organizations.some(o => o.acronym === 'IEEE') && options.majors.includes('Mechanical Engineering'));
  const board = async params => (await (await call(`/api/leaderboard?${new URLSearchParams(params)}`)).json()).data;
  const ids = rows => rows.map(r => r.memberId);
  const everyone = await board({});
  assert.deepEqual(ids(everyone.rows).slice(0, 3), ['member-leo', 'member-iris', 'member-ada'], 'all colleges by default');
  assert.ok(everyone.rows.every(r => r.universityName && r.major));
  assert.deepEqual(ids((await board({ organization: 'SAE' })).rows), ['member-nora', 'member-kai']);
  assert.deepEqual(ids((await board({ organization: 'AIAA', universityId: 'uni-meridian' })).rows), ['member-ada', 'member-juno', 'member-tomas']);
  assert.deepEqual((await board({ organization: 'ASME' })).rows, []);
  assert.deepEqual(ids((await board({ major: 'Mechanical Engineering' })).rows), ['member-ada', 'member-kai']);
  assert.deepEqual(ids((await board({ major: 'Mechanical Engineering', universityId: 'uni-aster' })).rows), ['member-kai']);
  assert.deepEqual((await board({ universityId: uta.id })).rows, []);
  assert.equal((await board({ universityId: uta.id })).filters.university.registered, false);
  assert.equal((await call('/api/leaderboard?organization=NOPE')).status, 400);
  assert.equal((await call('/api/leaderboard?major=Basket%20Weaving')).status, 400);
  const longId = (await search('Cattaraugus Allegany Erie Wyoming'))[0].id;
  assert.ok(longId.length > 80); assert.equal((await call(`/api/universities/${longId}/leaderboard`)).status, 200);
});
test('officers approve, give custom points to, or delete member requests', async t => {
  const server = createApp({ config }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { as, method = 'GET', body } = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(as ? { 'X-Demo-Member': as } : {}) }, body: body && JSON.stringify(body) });
  const json = async (...args) => (await call(...args)).json();
  const submit = async description => (await json('/api/clubs/club-rocketry/contribution-requests', { as: 'member-sana', method: 'POST', body: { description, evidence: 'Meeting notes excerpt naming Sana.', suggestedLevel: 'medium', date: '2026-11-10' } })).data;
  const review = (requestId, as, body) => call(`/api/contribution-requests/${requestId}/review`, { as, method: 'POST', body });
  const sanaPoints = async () => (await json('/api/members/member-sana')).data.stats.totalPoints;
  const before = await sanaPoints();
  // Permissions and validation
  const a = await submit('Calibrated the barometric altimeter against the ground station.');
  assert.equal((await review(a.id, null, { action: 'approve', level: 'medium' })).status, 401);
  assert.equal((await review(a.id, 'member-sana', { action: 'approve', level: 'high' })).status, 403, 'members cannot approve, including their own request');
  assert.equal((await review(a.id, 'member-nora', { action: 'approve', level: 'high' })).status, 403, 'officer of another club');
  for (const points of [45, 0, 110]) assert.equal((await review(a.id, 'member-iris', { action: 'approve', level: 'custom', customPoints: points })).status, 400, `custom ${points}`);
  assert.equal((await review(a.id, 'member-iris', { action: 'approve', level: 'custom' })).status, 400, 'custom needs points');
  assert.equal((await review(a.id, 'member-iris', { action: 'approve', level: 'medium', points: 999 })).status, 400, 'client cannot set points directly');
  assert.equal((await review('draft-1', 'member-iris', { action: 'approve', level: 'low' })).status, 404, 'Athena drafts are not member requests');
  // Approve with custom points
  const approved = await review(a.id, 'member-iris', { action: 'approve', level: 'custom', customPoints: 40 });
  assert.equal(approved.status, 200);
  const { contribution, request } = (await approved.json()).data;
  assert.deepEqual([contribution.points, contribution.level, contribution.approvedBy, contribution.memberId, request.status], [40, 'custom', 'member-iris', 'member-sana', 'approved']);
  assert.equal(await sanaPoints(), before + 40);
  assert.ok((await json('/api/members/member-sana')).data.contributions.some(c => c.id === contribution.id && c.source.memberSubmitted));
  assert.equal((await review(a.id, 'member-leo', { action: 'approve', level: 'high' })).status, 409, 'cannot be reviewed twice');
  // Approve at a preset level
  const b = await submit('Documented the avionics bay wiring harness for next year.');
  assert.equal((await (await review(b.id, 'member-leo', { action: 'approve', level: 'medium' })).json()).data.contribution.points, 60);
  assert.equal(await sanaPoints(), before + 100);
  // Delete
  const c = await submit('Organized the bench for the next integration session.');
  const deleted = (await (await review(c.id, 'member-iris', { action: 'delete' })).json()).data;
  assert.deepEqual([deleted.request.status, deleted.contribution], ['rejected', null]);
  assert.equal(await sanaPoints(), before + 100, 'deleting awards nothing');
  assert.equal((await review(c.id, 'member-iris', { action: 'approve', level: 'low' })).status, 409);
  // The officer queue and the member's own list both reflect the outcomes
  const queue = (await json('/api/clubs/club-rocketry/semesters', { as: 'member-iris' })).data.requests.map(r => r.id);
  assert.ok(![a.id, b.id, c.id].some(id => queue.includes(id)));
  const mine = (await json('/api/clubs/club-rocketry/contribution-requests', { as: 'member-sana' })).data;
  assert.deepEqual([a.id, b.id, c.id].map(id => mine.find(r => r.id === id).status), ['approved', 'approved', 'rejected']);
  assert.ok(fixtures.auditLogs.some(l => l.entryId === contribution.id && l.action === 'approve' && l.reviewerId === 'member-iris'));
  assert.ok(fixtures.auditLogs.some(l => l.entryId === c.id && l.action === 'delete'));
});
test('officers can reject previously approved contributions', async t => {
  const server = createApp({ config }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { as, method = 'GET', body } = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(as ? { 'X-Demo-Member': as } : {}) }, body: body && JSON.stringify(body) });
  const reject = (contributionId, as, body = {}) => call(`/api/contributions/${contributionId}/reject`, { as, method: 'POST', body });
  const irisPoints = async () => (await (await call('/api/members/member-iris')).json()).data.stats.totalPoints;
  const before = await irisPoints();
  // contribution-3: Iris's 90-point PCB power stage work in Aster Rocketry
  assert.equal((await reject('contribution-3', null)).status, 401);
  assert.equal((await reject('contribution-3', 'member-sana')).status, 403, 'members cannot reject');
  assert.equal((await reject('contribution-3', 'member-nora')).status, 403, 'officer of another club');
  assert.equal((await reject('contribution-3', 'member-iris')).status, 403, 'cannot reject your own contribution');
  assert.equal((await reject('contribution-nope', 'member-leo')).status, 404);
  assert.equal((await reject('contribution-3', 'member-leo', { points: 0 })).status, 400, 'unknown fields rejected');
  const res = await reject('contribution-3', 'member-leo', { reason: 'Duplicate of an earlier entry.' });
  assert.equal(res.status, 200);
  const rejected = (await res.json()).data;
  assert.deepEqual([rejected.status, rejected.deletedBy, rejected.deleteReason], ['deleted', 'member-leo', 'Duplicate of an earlier entry.']);
  assert.equal(await irisPoints(), before - 90);
  assert.equal((await reject('contribution-3', 'member-leo')).status, 409, 'cannot reject twice');
  const history = (await (await call('/api/clubs/club-rocketry/semesters', { as: 'member-leo' })).json()).data;
  assert.ok(!history.semesters.some(s => s.entries.some(c => c.id === 'contribution-3')));
  assert.ok(!(await (await call('/api/members/member-iris')).json()).data.contributions.some(c => c.id === 'contribution-3'));
  assert.ok(fixtures.auditLogs.some(l => l.entryId === 'contribution-3' && l.action === 'delete' && l.reviewerId === 'member-leo'));
  // A contribution that came from a member request shows as "later rejected" on the member's side
  const request = (await (await call('/api/clubs/club-rocketry/contribution-requests', { as: 'member-sana', method: 'POST', body: { description: 'Tested the recovery deployment charges on the bench.', evidence: 'Bench log naming Sana.', suggestedLevel: 'low', date: '2026-11-11' } })).json()).data;
  const { contribution } = (await (await call(`/api/contribution-requests/${request.id}/review`, { as: 'member-iris', method: 'POST', body: { action: 'approve', level: 'low' } })).json()).data;
  assert.equal((await reject(contribution.id, 'member-leo')).status, 200);
  const mine = (await (await call('/api/clubs/club-rocketry/contribution-requests', { as: 'member-sana' })).json()).data.find(r => r.id === request.id);
  assert.deepEqual([mine.status, mine.contributionRejected], ['approved', true]);
  // The officer UI offers Reject on others' entries but not on your own
  globalThis.localStorage = { getItem: () => 'member-leo', setItem() {} };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => realFetch(new URL(url, base), opts);
  try {
    const page = await (await import('../frontend/core/kleos.js')).renderKleos('all');
    assert.ok(page.includes('data-reject-contribution="contribution-2"'), "Sana's entry is rejectable");
    assert.ok(!page.includes('data-reject-contribution="contribution-1"'), "Leo can't reject his own entry");
  } finally { globalThis.fetch = realFetch; delete globalThis.localStorage; }
});
test('university leaderboard pipelines match the demo repository contract', () => {
  const contributors = universityContributorsPipeline('uni-aster');
  assert.deepEqual(contributors[0], { $match: { universityId: 'uni-aster', status: 'approved' } });
  assert.ok(contributors.some(stage => stage.$sort?.contributions === -1));
  assert.ok(universityTotalsPipeline().some(stage => stage.$lookup?.from === 'universities'));
  assert.deepEqual(['2026-01-15', '2026-02-01', '2026-06-01', '2026-08-24', '2026-11-30', '2026-12-31'].map(d => semesterOf(d).label), ['Winter 2025', 'Spring 2026', 'Summer 2026', 'Fall 2026', 'Fall 2026', 'Winter 2026']);
  assert.deepEqual(semesterOf('2027-01-10'), semesterOf('2026-12-05'));
  assert.equal(semesterOf('2026-12-05').end, '2027-02-01');
  assert.throws(() => semesterOf('2026-13-01'));
  assert.deepEqual(termsThrough('2026-11-14').map(t => t.label), ['Spring 2026', 'Summer 2026', 'Fall 2026', 'Winter 2026']);
  assert.deepEqual(termsThrough('2027-03-01').map(t => t.id).slice(-2), ['2027-spring', '2027-summer']);
  assert.equal(parseTerm('2026-autumn'), null);
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
test('setup creates all 15 collections including club invitations and succession roles', async () => {
  const created = [], installed = [];
  const db = { listCollections: () => ({ toArray: async () => [] }), createCollection: async (name, options) => created.push({ name, options }), collection: name => ({ createIndex: async (key, options) => installed.push({ name, key, options }) }) };
  await setupCollections(db);
  assert.equal(created.length, 15);
  assert.ok(created.every(c => c.options.validationAction === 'error'));
  assert.ok(installed.some(i => i.name === 'attendance' && i.key.sessionId && i.key.memberId && i.options.unique));
});
test('Git excludes environment secrets and uploads, but keeps the template', () => {
  const ignored = execFileSync('git', ['check-ignore', '--stdin'], { input: '.env\n.env.production\nuploads/notes.pdf\n.env.example\n', encoding: 'utf8' });
  assert.ok(ignored.includes('.env.production')); assert.ok(ignored.includes('uploads/notes.pdf')); assert.ok(!ignored.includes('.env.example'));
});

test('suggestion CSV handles quoted values, newlines, BOM and escaped quotes', () => {
  assert.deepEqual(parseCsv('\uFEFFName,Other\r\n"College, Main",x\r\n"A ""quoted"" name",y\n"Two\nlines",z'), [
    ['Name', 'Other'], ['College, Main', 'x'], ['A "quoted" name', 'y'], ['Two\nlines', 'z']
  ]);
  assert.throws(() => parseCsv('"unclosed'), /Unclosed quote/);
});
