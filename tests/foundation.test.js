import test from 'node:test';
import { parseCsv } from '../backend/services/discovery-options.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readConfig } from '../backend/config.js';
import { createApp } from '../backend/app.js';
import { createRepository } from '../backend/repositories/records.js';
import { contributionPoints, validateReviewer, weekStart } from '../backend/services/scoring.js';
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
  assert.deepEqual(all.data.rows.map(r => r.points), [190, 130, 100]);
  const week = await get('/api/clubs/club-rocketry/rankings?range=week');
  assert.equal(week.data.rows[0].points, 70);
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
    ['year=4', ['member-iris']],
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
      import('../frontend/recruiting/bow.js')
    ]);
    const output = await Promise.all(views.map(module => Object.values(module)[0]()));
    for (const page of output) { assert.ok(page.includes('<h1>')); assert.ok(!page.includes('undefined')); }
    assert.ok(output[0].includes('420'));
    assert.ok(output[1].includes('Approve · planned'));
    assert.ok(!output[3].includes('Sana Reed'));
    assert.ok((await views[2].renderKleos('week')).includes('70'));
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

test('suggestion CSV handles quoted values, newlines, BOM and escaped quotes', () => {
  assert.deepEqual(parseCsv('\uFEFFName,Other\r\n"College, Main",x\r\n"A ""quoted"" name",y\n"Two\nlines",z'), [
    ['Name', 'Other'], ['College, Main', 'x'], ['A "quoted" name', 'y'], ['Two\nlines', 'z']
  ]);
  assert.throws(() => parseCsv('"unclosed'), /Unclosed quote/);
});
