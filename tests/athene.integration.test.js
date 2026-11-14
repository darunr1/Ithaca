import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { readConfig } from '../backend/config.js';
import { connectDatabase } from '../database/connection.js';
import { createApp } from '../backend/app.js';
import { createAtheneGemini } from '../backend/athene/gemini.js';
import { createAtheneRepository, setupAthene, COLLECTIONS } from '../backend/athene/repository.js';
import { hash } from '../backend/athene/chunking.js';
import { sampleContent, makePdf, makeDocx } from '../scripts/athene-sample-data.js';

test('LIVE: HTTP ingestion → Gemini embeddings → Atlas persistence/vector search → Gemini cited contribution answer', {
  skip: process.env.ATHENE_INTEGRATION !== 'true' ? 'Set ATHENE_INTEGRATION=true with real Gemini, Atlas and a valid bearer token to opt in.' : false,
  timeout: 420000
}, async t => {
  const config = readConfig();
  assert.equal(config.ATHENE_ENABLED, true, 'Set ATHENE_ENABLED=true with DATA_MODE=atlas and AI_MODE=live.');
  assert.ok(config.MONGODB_DB.endsWith('_demo'), 'Use a fictional _demo database for integration tests.');
  const token = process.env.ATHENE_TEST_BEARER_TOKEN || config.ATHENE_DEV_TOKEN;
  assert.ok(token, 'Provide ATHENE_TEST_BEARER_TOKEN or a restricted ATHENE_DEV_TOKEN.');
  const projectId = process.env.ATHENE_TEST_PROJECT_ID || 'club-rocketry';
  const marker = `Integration specimen ${randomUUID()}`;
  const files = sampleContent.map(sample => {
    const sections = sample.sections?.map(s => ({ ...s, text: `${marker}. ${s.text}` }));
    return { filename: sample.filename, mimeType: sample.type === 'pdf' ? 'application/pdf' : sample.type === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/step', buffer: sample.type === 'pdf' ? makePdf(sections) : sample.type === 'docx' ? makeDocx(sections) : Buffer.from(sample.text.replace('metadata only', `metadata only; ${marker}`)) };
  });
  const ids = files.map(file => hash(JSON.stringify([projectId, hash(file.buffer)])));
  const connection = await connectDatabase(config); const db = connection.db;
  // Only delete this run's uniquely tagged artifacts; never drop collections, project records or indexes.
  t.after(async () => {
    try {
      await db.collection(COLLECTIONS.chunks).deleteMany({ projectId, documentId: { $in: ids } });
      await db.collection(COLLECTIONS.files).deleteMany({ projectId, _id: { $in: ids } });
      await db.collection(COLLECTIONS.documents).deleteMany({ projectId, id: { $in: ids } });
    } finally { await connection.close(); }
  });
  await setupAthene(db, config);
  const server = createApp({ config, db }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const root = `http://127.0.0.1:${server.address().port}/api/projects/${projectId}/athene`;
  const headers = { Authorization: `Bearer ${token}` };
  const form = new FormData(); files.forEach(file => form.append('files', new Blob([file.buffer], { type: file.mimeType }), file.filename));
  const upload = await fetch(`${root}/documents`, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(210000) });
  const uploaded = await upload.json(); assert.equal(upload.status, 200, JSON.stringify(uploaded));
  assert.equal(uploaded.data.documents.length, 5); assert.ok(uploaded.data.documents.every(d => d.status === 'ready'));
  const stored = await db.collection(COLLECTIONS.chunks).find({ projectId, documentId: { $in: ids } }).toArray();
  assert.ok(stored.length >= 5); assert.ok(stored.every(c => c.embedding.length === config.EMBEDDING_DIMENSIONS && c.embedding.every(Number.isFinite)));
  const repo = createAtheneRepository(db, config); const ai = createAtheneGemini(config);
  const question = 'What completed battery monitor firmware work is documented for Darun?';
  const [vector] = await ai.embed([question], 'RETRIEVAL_QUERY');
  let retrieved = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    retrieved = await repo.search(projectId, vector);
    if (retrieved.some(c => ids.includes(c.documentId))) break;
    await sleep(3000); // Atlas indexing is eventually consistent.
  }
  assert.ok(retrieved.some(c => ids.includes(c.documentId)), 'New documents were not visible through real $vectorSearch within 90 seconds.');
  assert.ok(retrieved.every(c => c.projectId === projectId));
  const response = await fetch(`${root}/contributions/query`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ person: 'Darun', question }), signal: AbortSignal.timeout(105000) });
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.data.insufficientEvidence, false); assert.ok(result.data.citations.length);
  assert.equal(result.data.retrieval.engine, 'mongodb-atlas-vector-search');
  for (const citation of result.data.citations) {
    const chunk = await db.collection(COLLECTIONS.chunks).findOne({ projectId, documentId: citation.documentId, chunkId: citation.chunkId });
    assert.ok(chunk, 'Citation must resolve to a real stored project chunk.');
  }
  t.diagnostic(`Live services succeeded: ${files.length} documents, ${stored.length} stored embeddings, ${retrieved.length} Atlas matches, ${result.data.citations.length} grounded citations.`);
});
