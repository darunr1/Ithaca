import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { atheneRoutes } from '../backend/athene/routes.js';
import { authorizeProject, assertAtheneScope } from '../backend/athene/auth.js';
import { groundAnswer } from '../backend/athene/service.js';

const db = { collection(name) { return { async findOne({ id }) {
  if (name === 'members') {
    if (id === 'officer') return { id, clubIds: ['club-a'], universityId: 'uni-a' };
    if (id === 'member') return { id, clubIds: ['club-a'], universityId: 'uni-a' };
    if (id === 'revoked') return { id, clubIds: [], universityId: 'uni-a' };
    return { id, clubIds: ['club-b'], universityId: 'uni-b' };
  }
  return id === 'club-a' ? { id, universityId: 'uni-a', officerIds: ['officer', 'revoked'] } : null;
} }; } };

async function server(t, overrides = {}) {
  const app = express();
  app.use(express.json());
  const service = {
    authorize: (actor, club, write) => authorizeProject(db, actor, club, write),
    list: async (actor, club) => [{ id: 'doc-a', projectId: club, status: 'ready' }],
    status: async (actor, club, doc) => ({ id: doc, projectId: club, status: 'ready' }),
    query: async (actor, club) => ({ projectId: club, answer: 'No evidence', citations: [] }),
    upload: async (actor, club) => [{ id: 'doc-a', projectId: club, status: 'ready' }],
    ...overrides
  };
  app.use('/api/projects/:projectId/athene', atheneRoutes({ db, config: { ATHENE_ENABLED: true },
    authenticate: async req => req.headers.authorization?.replace('Bearer ', '') || null, service }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: { code: error.code } }));
  const instance = app.listen(0, '127.0.0.1');
  await new Promise(resolve => instance.once('listening', resolve));
  t.after(() => new Promise(resolve => instance.close(resolve)));
  return 'http://127.0.0.1:' + instance.address().port + '/api/projects/club-a/athene';
}

test('Athene blocks outsider and revoked officer before upload, query or document access', async t => {
  let usedService = 0;
  const root = await server(t, {
    query: async () => { usedService++; return { projectId: 'club-a', answer: 'private', citations: [] }; },
    upload: async () => { usedService++; return []; }
  });
  for (const actor of ['outsider', 'revoked']) {
    const headers = { Authorization: 'Bearer ' + actor };
    const query = await fetch(root + '/query', { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Please cite documents' }) });
    assert.equal(query.status, 404);
    const form = new FormData();
    form.append('files', new Blob(['%PDF-test'], { type: 'application/pdf' }), 'test.pdf');
    assert.equal((await fetch(root + '/documents', { method: 'POST', headers, body: form })).status, 404);
    assert.equal((await fetch(root + '/documents/secret', { headers })).status, 404);
  }
  assert.equal(usedService, 0);
});

test('Athene blocks non-officer uploads but keeps same-club member queries usable', async t => {
  const root = await server(t);
  const headers = { Authorization: 'Bearer member' };
  const q = await fetch(root + '/query', { method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Firmware review?' }) });
  assert.equal(q.status, 200);
  const form = new FormData();
  form.append('files', new Blob(['%PDF-test'], { type: 'application/pdf' }), 'test.pdf');
  assert.equal((await fetch(root + '/documents', { method: 'POST', headers, body: form })).status, 403);
});

test('Athene rejects foreign document/upload/query responses and citations before serialization', async t => {
  const foreign = { id: 'doc-secret', projectId: 'club-b', status: 'ready' };
  assert.throws(() => assertAtheneScope({ projectId: 'club-a', citations: [{ projectId: 'club-b' }] }, 'club-a'), { code: 'ATHENE_SCOPE_ERROR' });
  // Reports that belong to the club must not smuggle other-club citations.
  assert.throws(() => assertAtheneScope({ insights: [{ id: 'report-a', projectId: 'club-a',
    citations: [{ projectId: 'club-b', documentId: 'foreign' }] }] }, 'club-a'),
    { code: 'ATHENE_SCOPE_ERROR' });
  // Historical reports without an explicit citation scope remain readable.
  assert.equal(assertAtheneScope({ insights: [{ id: 'old', projectId: 'club-a',
    citations: [{ documentId: 'historical' }] }] }, 'club-a').insights.length, 1);
  assert.throws(() => groundAnswer({ statements: [], insufficientEvidence: true, conflictingEvidence: false },
    [{ projectId: 'club-b', sourceId: 'src-foreign', text: 'Other club source' }], 'club-a'), { code: 'RETRIEVAL_SCOPE_ERROR' });
  const root = await server(t, {
    list: async () => [foreign],
    query: async () => ({ projectId: 'club-b', answer: 'Private material', citations: [] }),
    upload: async () => [foreign]
  });
  const headers = { Authorization: 'Bearer officer' };
  const docs = await fetch(root + '/documents', { headers });
  assert.equal(docs.status, 503); assert.equal((await docs.json()).error.code, 'ATHENE_SCOPE_ERROR');
  const q = await fetch(root + '/query', { method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Private material?' }) });
  assert.equal(q.status, 503); assert.equal((await q.json()).error.code, 'ATHENE_SCOPE_ERROR');
  const form = new FormData();
  form.append('files', new Blob(['%PDF-test'], { type: 'application/pdf' }), 'test.pdf');
  const uploaded = await fetch(root + '/documents', { method: 'POST', headers, body: form });
  assert.equal(uploaded.status, 503); assert.equal((await uploaded.json()).error.code, 'ATHENE_SCOPE_ERROR');
});
