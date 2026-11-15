import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { zipSync, strToU8 } from 'fflate';
import { readConfig } from '../backend/config.js';
import { createApp } from '../backend/app.js';
import { connectDatabase } from '../database/connection.js';
import { extractFile, extractInWorker, validateFile } from '../backend/athene/extraction.js';
import { chunkSections, hash, pipelineProfile } from '../backend/athene/chunking.js';
import { createAtheneGemini, validateVector } from '../backend/athene/gemini.js';
import { authorizeProject, createAuthenticator } from '../backend/athene/auth.js';
import { createAtheneRepository, vectorDefinition, checkIndex, setupAthene } from '../backend/athene/repository.js';
import { createAtheneService, groundAnswer } from '../backend/athene/service.js';
import { sampleFiles, makeDocx, makePdf } from '../scripts/athene-sample-data.js';

const config = readConfig({});
const vector = Array.from({ length: 768 }, (_, i) => i === 0 ? 1 : 0);
const goodIndex = { type: 'vectorSearch', status: 'READY', queryable: true, latestDefinition: vectorDefinition(config) };
const sample = sampleFiles();
const source = { projectId: 'club-a', sourceId: 'src_chunk-a', chunkId: 'chunk-a', documentId: 'doc-a', filename: 'firmware.pdf', page: 2, section: null, score: 0.9, text: 'Darun completed the battery monitor firmware. Teja reviewed the decoder.' };
const answer = { statements: [{ text: 'Darun completed the battery monitor firmware.', person: 'Darun', attribution: 'documented', evidence: [{ sourceId: source.sourceId, quote: 'Darun completed the battery monitor firmware.' }] }], insufficientEvidence: false, conflictingEvidence: false };

function accessDb() {
  return { collection(name) { return { async findOne({ id }) {
    return name === 'members' ? { id, clubIds: id === 'outsider' ? ['other'] : ['club-a'], universityId: 'uni-a' } : id === 'club-a' ? { id, officerIds: ['officer'], universityId: 'uni-a' } : null;
  } }; } };
}
function memoryRepository() {
  // Test double only: production exclusively uses MongoDB and $vectorSearch.
  const docs = new Map(); const files = new Map(); const chunks = new Map();
  return {
    docs, chunks, results: [source],
    async register(projectId, uploaderId, file) {
      const id = hash(projectId + hash(file.buffer));
      if (!docs.has(id)) docs.set(id, { id, projectId, uploaderId, filename: file.originalname, mimeType: file.mimetype, status: 'pending' });
      files.set(id, file.buffer); return structuredClone(docs.get(id));
    },
    async source(projectId, id) { return files.get(id); },
    async claim(projectId, id) { const doc = docs.get(id); if (doc.status === 'processing') return null; Object.assign(doc, { status: 'processing', leaseId: crypto.randomUUID() }); return structuredClone(doc); },
    async get(projectId, id) { const doc = docs.get(id); return doc?.projectId === projectId ? structuredClone(doc) : null; },
    async list(projectId) { return [...docs.values()].filter(d => d.projectId === projectId).map(d => structuredClone(d)); },
    async cached(projectId, documentId) { return [...chunks.values()].filter(c => c.documentId === documentId); },
    async retireRuns(projectId, documentId, runIds) { for (const [key, chunk] of chunks) if (chunk.projectId === projectId && chunk.documentId === documentId && runIds.includes(chunk.runId)) chunks.delete(key); },
    async saveChunks(records) { for (const c of records) chunks.set(c.runId + c.chunkId, c); },
    async complete(record, details) { Object.assign(docs.get(record.id), details, { status: 'ready', activeRunId: record.leaseId }); },
    async markFailed(record, error) { Object.assign(docs.get(record.id), { status: 'failed', error }); },
    async search() { return this.results; }
  };
}
function testService(overrides = {}) {
  const repository = overrides.repository || memoryRepository();
  const calls = { embeddings: 0, answers: 0 };
  const ai = { async embed(texts) { calls.embeddings++; return texts.map(() => vector); }, async answer() { calls.answers++; return structuredClone(answer); } };
  const service = createAtheneService({ db: accessDb(), config, repository, ai, extract: extractFile, ...overrides });
  return { service, repository, calls, ai };
}
async function listen(t, server) {
  if (typeof server === 'function') server = createServer(server);
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('PDF extracts page-specific engineering text; DOCX retains headings without invented pages', async () => {
  const pdf = await extractFile(sample[0]);
  assert.equal(pdf.sections.length, 2); assert.equal(pdf.sections[1].page, 2); assert.match(pdf.sections[0].text, /Darun implemented/);
  const docx = await extractFile(sample[1]);
  assert.equal(docx.sections.length, 2); assert.equal(docx.sections[0].section, 'Battery management review'); assert.equal(docx.sections[0].page, null);
  assert.match(docx.sections[1].text, /completion has not been recorded/);
});
test('worker extraction runs real parser and terminates on cancellation', async () => {
  assert.match((await extractInWorker(sample[1])).sections[0].text, /Vaibhav/);
  await assert.rejects(extractInWorker(sample[0], AbortSignal.abort()), { code: 'PROCESSING_TIMEOUT' });
});
test('all five realistic fixtures extract, STEP and DXF expose only supported metadata', async () => {
  for (const file of sample) assert.ok((await extractFile(file)).sections.length);
  const step = await extractFile(sample[4]);
  assert.match(step.sections[0].text, /Vaibhav/); assert.match(step.warnings[0], /Geometry/);
  const dxf = await extractFile({ originalname: 'drawing.dxf', mimetype: 'application/dxf', buffer: Buffer.from('0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1032\n0\nENDSEC\n999\nArgos bracket metadata\n0\nEOF\n') });
  assert.match(dxf.sections[0].text, /AC1032/); assert.match(dxf.sections[0].text, /Argos bracket/);
});
test('rejects MIME mismatch, unsupported CAD, malformed, empty and oversized files', async () => {
  for (const file of [{ ...sample[0], mimetype: 'text/plain' }, { ...sample[4], originalname: 'model.dwg' }]) assert.throws(() => validateFile(file), { code: 'UNSUPPORTED_FILE' });
  await assert.rejects(extractFile({ ...sample[0], buffer: Buffer.from('bad') }), { code: 'INVALID_PDF' });
  await assert.rejects(extractFile({ ...sample[1], buffer: Buffer.from('PKbad') }), { code: 'MALFORMED_FILE' });
  assert.throws(() => validateFile({ ...sample[0], buffer: Buffer.alloc(0) }), { code: 'EMPTY_FILE' });
  assert.throws(() => validateFile({ ...sample[0], buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }), { code: 'FILE_TOO_LARGE' });
  await assert.rejects(extractFile({ ...sample[1], buffer: makeDocx([]) }), { code: 'NO_TEXT' });
  await assert.rejects(extractFile({ ...sample[0], buffer: makePdf([{ title: '', text: '' }]) }), { code: 'NO_TEXT' });
});
test('DOCX rejects XML entities and decompression bombs', async () => {
  const unsafe = zipSync({ 'word/document.xml': strToU8('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]><x>&e;</x>') });
  await assert.rejects(extractFile({ ...sample[1], buffer: Buffer.from(unsafe) }), { code: 'INVALID_DOCX' });
  const bomb = zipSync({ 'word/document.xml': new Uint8Array(21 * 1024 * 1024) });
  await assert.rejects(extractFile({ ...sample[1], buffer: Buffer.from(bomb) }), { code: 'DOCX_EXPANSION_LIMIT' });
});
test('encrypted PDF returns an actionable stored-processing error code', async () => {
  const pdf = makePdf([{ title: 'Locked', text: 'Password protected engineering note' }]).toString();
  const encryption = `/Root 1 0 R /Encrypt << /Filter /Standard /V 1 /R 2 /Length 40 /O <${'00'.repeat(32)}> /U <${'00'.repeat(32)}> /P -4 >> /ID [<0011223344556677><0011223344556677>] >>`;
  await assert.rejects(extractFile({ ...sample[0], buffer: Buffer.from(pdf.replace('/Root 1 0 R >>', encryption)) }), { code: 'ENCRYPTED_FILE' });
});
test('chunking is stable, bounded, overlapping, preserves source boundaries and changes with content', () => {
  const text = 'Darun completed firmware. Teja tested software. '.repeat(20);
  const input = [{ text, page: 1, section: 'Firmware' }, { text: 'Other page evidence.', page: 2 }];
  const chunks = chunkSections(input, { documentId: 'd', size: 200, overlap: 40 });
  assert.ok(chunks.length > 2); assert.ok(chunks.every(c => c.text.length <= 200));
  assert.equal(chunks.at(-1).page, 2); assert.equal(chunks[0].section, 'Firmware');
  assert.deepEqual(chunks, chunkSections(input, { documentId: 'd', size: 200, overlap: 40 }));
  assert.notEqual(chunks[0].chunkId, chunkSections([{ text: 'Changed' }], { documentId: 'd' })[0].chunkId);
  const overlaps = Array.from({ length: 41 }, (_, n) => n).filter(n => chunks[0].text.slice(-n) === chunks[1].text.slice(0, n));
  assert.ok(Math.max(...overlaps) >= 20);
  assert.throws(() => chunkSections([], { documentId: 'd', size: 10, overlap: 10 }));
});
test('Gemini batches embeddings, uses matching retrieval tasks, normalizes dimensions and retries 429', async () => {
  const calls = []; let first = true; let pauses = 0;
  const ai = createAtheneGemini(config, { pause: async () => { pauses++; }, client: { models: { async embedContent(input) { calls.push(input); if (first) { first = false; throw { status: 429 }; } return { embeddings: input.contents.map(() => ({ values: vector.map(v => v * 3) })) }; } } } });
  assert.equal((await ai.embed(Array(18).fill('engineering text'), 'RETRIEVAL_DOCUMENT')).length, 18);
  await ai.embed(['Who wrote firmware?'], 'RETRIEVAL_QUERY');
  assert.equal(pauses, 1); assert.equal(calls[0].contents.length, 16); assert.equal(calls.at(-1).config.taskType, 'RETRIEVAL_QUERY');
  assert.equal(calls[0].config.outputDimensionality, 768);
  assert.equal(validateVector(vector.map(v => v * 3), 768)[0], 1);
});
test('invalid dimensions, nonfinite vectors, missing counts and Gemini failures never become success', async () => {
  for (const bad of [[], [NaN], Array(768).fill(0), Array(768).fill(Infinity)]) assert.throws(() => validateVector(bad, 768), { code: 'INVALID_EMBEDDING' });
  const ai = createAtheneGemini(config, { client: { models: { async embedContent() { return { embeddings: [] }; } } } });
  await assert.rejects(ai.embed(['text'], 'RETRIEVAL_QUERY'), { code: 'INVALID_EMBEDDING' });
  for (const status of [401, 429, 503]) {
    let calls = 0;
    const broken = createAtheneGemini(config, { pause: async () => {}, client: { models: { async embedContent() { calls++; throw { status }; } } } });
    await assert.rejects(broken.embed(['text'], 'RETRIEVAL_QUERY'), { code: 'GEMINI_UNAVAILABLE' });
    assert.equal(calls, status === 401 ? 1 : 3);
  }
});
test('Gemini generation uses untrusted source instructions and rejects malformed structured output', async () => {
  let input;
  const ai = createAtheneGemini(config, { client: { models: { async generateContent(value) { input = value; return { text: JSON.stringify(answer) }; } } } });
  assert.deepEqual(await ai.answer('Firmware?', [source], true), answer);
  assert.match(input.config.systemInstruction, /UNTRUSTED DATA/); assert.ok(input.config.responseJsonSchema);
  assert.ok(!JSON.parse(input.contents).sources[0].filename);
  let attempts = 0;
  const broken = createAtheneGemini(config, { client: { models: { async generateContent() { attempts++; return { text: '{bad' }; } } } });
  await assert.rejects(broken.answer('Firmware?', [source], false), { code: 'INVALID_AI_RESPONSE' });
  assert.equal(attempts, 2);
  for (const malformed of ['{bad', JSON.stringify({ statements: [], insufficientEvidence: 'not-a-boolean' })]) {
    const requests = [];
    const recovered = createAtheneGemini(config, { client: { models: { async generateContent(request) {
      requests.push(request);
      return { text: requests.length === 1 ? malformed : JSON.stringify(answer) };
    } } } });
    assert.deepEqual(await recovered.answer('Firmware?', [source], true), answer);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].contents, requests[0].contents);
  }
  let deniedCalls = 0;
  const denied = createAtheneGemini(config, { client: { models: { async generateContent() { deniedCalls++; throw { status: 401 }; } } } });
  await assert.rejects(denied.answer('Firmware?', [source], false), { code: 'GEMINI_UNAVAILABLE' });
  assert.equal(deniedCalls, 1);
});
test('authorization uses existing club membership, university scope and officer upload policy', async () => {
  const db = accessDb();
  await authorizeProject(db, 'officer', 'club-a', true);
  await authorizeProject(db, 'member', 'club-a');
  await assert.rejects(authorizeProject(db, 'member', 'club-a', true), { status: 403 });
  await assert.rejects(authorizeProject(db, 'outsider', 'club-a'), { status: 404 });
  await assert.rejects(authorizeProject(db, 'officer', 'club-b'), { status: 404 });
  await assert.rejects(authorizeProject(db, null, 'club-a'), { status: 401 });
  await assert.rejects(authorizeProject({ collection() { throw new Error('private URI'); } }, 'officer', 'club-a'), { code: 'DATABASE_UNAVAILABLE' });
});
test('JWT verification enforces issuer, audience, expiration and signature; client headers do not establish identity', async t => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256' };
  const base = await listen(t, createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })); }));
  const authenticate = createAuthenticator({ ...config, AUTH_JWKS_URL: base, AUTH_ISSUER: 'test-issuer', AUTH_AUDIENCE: 'ithaca' });
  const token = (issuer = 'test-issuer', expiry = '1h') => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject('officer').setIssuer(issuer).setAudience('ithaca').setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  const req = token => ({ headers: { authorization: `Bearer ${token}` }, socket: {} });
  assert.equal(await authenticate(req(await token())), 'officer');
  await assert.rejects(authenticate(req(await token('wrong'))), { status: 401 });
  await assert.rejects(authenticate(req(await token('test-issuer', '-1s'))), { status: 401 });
  await assert.rejects(authenticate(req('forged')), { status: 401 });
  await assert.rejects(authenticate({ headers: { 'x-user-id': 'officer' } }), { status: 401 });
});
test('Atlas retrieval validates ready index and applies prefilter, active generation join, projection and dimensions', async () => {
  let pipeline;
  const db = { collection() { return { listSearchIndexes() { return { async toArray() { return [goodIndex]; } }; }, aggregate(value) { pipeline = value; return { async toArray() { return [source]; } }; } }; } };
  const repository = createAtheneRepository(db, config);
  assert.deepEqual(await repository.search('club-a', vector), [source]);
  assert.deepEqual(pipeline[0].$vectorSearch.filter, { projectId: 'club-a', profile: pipelineProfile(config) });
  assert.ok(pipeline.some(stage => stage.$lookup?.pipeline[0].$match.status === 'ready'));
  assert.equal(pipeline.at(-1).$project._id, 0);
  assert.ok(!pipeline.at(-1).$project.embedding);
  await assert.rejects(repository.search('club-a', [1]), { code: 'INVALID_EMBEDDING' });
  await assert.rejects(repository.search('club-b', vector), { code: 'RETRIEVAL_SCOPE_ERROR' });
});
test('Atlas missing, building and mismatched indexes fail distinctly; database errors are sanitized', async () => {
  for (const index of [undefined, { ...goodIndex, queryable: false }, { ...goodIndex, status: 'BUILDING' }]) assert.throws(() => checkIndex(index, config), { code: 'VECTOR_INDEX_NOT_READY' });
  assert.throws(() => checkIndex({ ...goodIndex, latestDefinition: vectorDefinition({ ...config, EMBEDDING_DIMENSIONS: 1536 }) }, config), { code: 'VECTOR_INDEX_MISMATCH' });
  const db = { collection() { return { listSearchIndexes() { throw new Error('secret connection string'); } }; } };
  await assert.rejects(createAtheneRepository(db, config).search('club-a', vector), error => error.code === 'DATABASE_UNAVAILABLE' && !error.message.includes('secret'));
});
test('real MongoDB driver connection failure never falls back to fixtures', async () => {
  await assert.rejects(connectDatabase({ DATA_MODE: 'atlas', MONGODB_URI: 'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=100', MONGODB_DB: 'athene_connection_test_demo' }), /Atlas connection failed; no demo fallback/);
});
test('MongoDB persistence uses scoped stable identity, bounded source storage and fenced activation', async () => {
  const writes = []; let saved;
  const db = { collection(name) { return {
    async updateOne(filter, update, options) { writes.push({ name, filter, update, options }); if (name === 'atheneDocuments' && update.$setOnInsert) saved = update.$setOnInsert; return { matchedCount: 1 }; },
    async findOne() { return saved; },
    async bulkWrite(operations) { writes.push({ name, operations }); }
  }; } };
  const repo = createAtheneRepository(db, config);
  const a = await repo.register('club-a', 'officer', sample[0]); const b = await repo.register('club-a', 'officer', sample[0]);
  assert.equal(a.id, b.id); assert.equal(writes[0].filter.projectId, 'club-a');
  assert.equal(writes[1].name, 'atheneFiles'); assert.ok(Buffer.isBuffer(writes[1].update.$setOnInsert.buffer));
  await repo.saveChunks([{ ...source, runId: 'lease-a', embedding: vector }]);
  assert.equal(writes.at(-1).operations[0].updateOne.upsert, true);
  await repo.complete({ id: a.id, projectId: 'club-a', leaseId: 'lease-a' }, { chunkCount: 1 });
  assert.equal(writes.at(-1).filter.leaseId, 'lease-a'); assert.ok(writes.at(-1).filter.leaseUntil.$gt instanceof Date);
  assert.equal(writes.at(-1).update.$set.activeRunId, 'lease-a');
});
test('setup touches only Athene collections and creates unique idempotency indexes plus Atlas vector index', async () => {
  const collections = []; const indexes = []; const searches = [];
  const db = { listCollections() { return { async toArray() { return []; } }; }, async createCollection(name) { collections.push(name); }, collection(name) { return { async createIndex(key, options) { indexes.push({ name, key, options }); }, listSearchIndexes() { return { async toArray() { return []; } }; }, async createSearchIndex(value) { searches.push(value); } }; } };
  await setupAthene(db, config, true);
  assert.deepEqual(collections.sort(), ['atheneChunks', 'atheneDocuments', 'atheneFiles']);
  assert.ok(indexes.some(i => i.key.contentHash && i.options.unique));
  assert.deepEqual(searches[0].definition, vectorDefinition(config));
});
test('citation metadata is assembled from retrieved chunks; unknown IDs, forged quotes and attribution fail closed', () => {
  const result = groundAnswer(answer, [source], 'club-a', true);
  assert.equal(result.citations[0].filename, 'firmware.pdf'); assert.equal(result.citations[0].page, 2); assert.equal(result.insufficientEvidence, false);
  for (const evidence of [{ sourceId: 'invented', quote: source.text }, { sourceId: source.sourceId, quote: 'Invented completion.' }]) {
    const output = structuredClone(answer); output.statements[0].evidence = [evidence];
    assert.throws(() => groundAnswer(output, [source], 'club-a'), { code: 'UNGROUNDED_CITATION' });
  }
  const output = structuredClone(answer); output.statements[0].person = 'Sriram';
  assert.throws(() => groundAnswer(output, [source], 'club-a', true), { code: 'UNGROUNDED_ATTRIBUTION' });
});
test('contribution queries preserve ambiguous mentions and conflicting accounts without claiming completed work', () => {
  const output = structuredClone(answer);
  Object.assign(output.statements[0], { person: 'Teja', text: 'Teja reviewed the decoder; implementation is not established.', attribution: 'ambiguous', evidence: [{ sourceId: source.sourceId, quote: 'Teja reviewed the decoder.' }] });
  output.conflictingEvidence = true;
  const result = groundAnswer(output, [source], 'club-a', true);
  assert.equal(result.insufficientEvidence, true); assert.equal(result.conflictingEvidence, true); assert.equal(result.reviewRequired, true);
  assert.equal(result.statements[0].attribution, 'ambiguous');
});
test('service ingests five files, caches unchanged uploads and resumes failed processing without duplicate API calls', async () => {
  const { service, repository, calls } = testService();
  const docs = await service.upload('officer', 'club-a', sample);
  assert.equal(docs.length, 5); assert.ok(docs.every(d => d.status === 'ready'));
  const count = calls.embeddings; const chunks = repository.chunks.size;
  const repeated = await service.upload('officer', 'club-a', sample);
  assert.ok(repeated.every(d => d.reused)); assert.equal(calls.embeddings, count); assert.equal(repository.chunks.size, chunks);
  const doc = repository.docs.get(docs[0].id); doc.status = 'failed';
  assert.equal((await service.reprocess('officer', 'club-a', doc.id)).status, 'ready');
  assert.equal(calls.embeddings, count);
  assert.equal(repository.chunks.size, chunks);
  await assert.rejects(service.status('officer', 'club-a', 'missing'), { status: 404 });
});
test('failed extraction and Gemini errors persist sanitized status and do not activate chunks', async () => {
  const { service, repository } = testService({ ai: { async embed() { throw new Error('private provider key'); } } });
  const [doc] = await service.upload('officer', 'club-a', [sample[0]]);
  assert.equal(doc.status, 'failed'); assert.equal(doc.error.code, 'PROCESSING_FAILED'); assert.ok(!JSON.stringify(doc).includes('private provider'));
  assert.equal(repository.chunks.size, 0);
  const [bad] = await service.upload('officer', 'club-a', [{ ...sample[0], buffer: Buffer.from('not pdf') }]);
  assert.equal(bad.status, 'failed'); assert.equal(bad.error.code, 'INVALID_PDF');
  const [unsupported] = await service.upload('officer', 'club-a', [{ ...sample[4], originalname: 'unsupported.dwg' }]);
  assert.equal(unsupported.error.code, 'UNSUPPORTED_FILE');
});
test('concurrent duplicates do not start two ingestion jobs; expired work cannot be presented as ready', async () => {
  let finish; let started;
  const gate = new Promise(resolve => { finish = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const { service, repository, calls } = testService({ extract: async file => { started(); await gate; return extractFile(file); } });
  const first = service.upload('officer', 'club-a', [sample[0]]);
  await entered;
  const second = await service.upload('officer', 'club-a', [sample[0]]);
  assert.equal(second[0].status, 'processing'); assert.equal(calls.embeddings, 0);
  finish(); assert.equal((await first)[0].status, 'ready'); assert.equal(calls.embeddings, 1);
  const doc = [...repository.docs.values()][0]; doc.status = 'failed';
  const aborted = await service.reprocess('officer', 'club-a', doc.id, AbortSignal.abort());
  assert.equal(aborted.status, 'failed'); assert.equal(aborted.error.code, 'PROCESSING_TIMEOUT');
});
test('empty retrieval skips generation; forbidden users cannot embed, ingest, inspect or retrieve', async () => {
  const { service, repository, calls } = testService(); repository.results = [];
  const empty = await service.query('member', 'club-a', 'Who wrote firmware?');
  assert.equal(empty.insufficientEvidence, true); assert.deepEqual(empty.citations, []); assert.equal(calls.answers, 0);
  const previous = calls.embeddings;
  for (const action of [() => service.query('outsider', 'club-a', 'Question'), () => service.upload('member', 'club-a', [sample[0]]), () => service.list('outsider', 'club-a'), () => service.status('outsider', 'club-a', 'any')]) await assert.rejects(action);
  assert.equal(calls.embeddings, previous); assert.equal(repository.docs.size, 0);
  repository.results = [{ ...source, projectId: 'secret-club' }];
  await assert.rejects(service.query('member', 'club-a', 'Question'), { code: 'RETRIEVAL_SCOPE_ERROR' });
});
test('config fails closed; local bearer is restricted to loopback and fictional databases', () => {
  assert.throws(() => readConfig({ ATHENE_ENABLED: 'true' }), /requires/);
  const live = { DATA_MODE: 'atlas', AI_MODE: 'live', MONGODB_URI: 'mongodb://localhost', GEMINI_API_KEY: 'test-only', ATHENE_ENABLED: 'true', ATHENE_DEV_TOKEN: 't'.repeat(32) };
  assert.equal(readConfig(live).ATHENE_ENABLED, true);
  for (const values of [{ HOST: '0.0.0.0' }, { NODE_ENV: 'production' }, { MONGODB_DB: 'ithaca' }, { ATHENE_DEV_TOKEN: 'short' }]) assert.throws(() => readConfig({ ...live, ...values }), /requires/);
});
test('HTTP upload/status/RAG/contribution/reprocess use real routing, auth and validation', async t => {
  const { service } = testService();
  const localConfig = { ...config, ATHENE_ENABLED: true, ATHENE_DEV_TOKEN: 't'.repeat(32), ATHENE_DEV_MEMBER_ID: 'officer' };
  const base = await listen(t, createApp({ config: localConfig, athene: { service } }));
  const root = `${base}/api/projects/club-a/athene`;
  const headers = { Authorization: `Bearer ${localConfig.ATHENE_DEV_TOKEN}` };
  assert.equal((await fetch(`${root}/documents`)).status, 401);
  const form = new FormData(); for (const file of sample) form.append('files', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  const uploaded = await fetch(`${root}/documents`, { method: 'POST', headers, body: form });
  assert.equal(uploaded.status, 200); const docs = (await uploaded.json()).data.documents; assert.equal(docs.length, 5);
  assert.equal((await (await fetch(`${root}/documents/${docs[0].id}`, { headers })).json()).data.status, 'ready');
  assert.equal((await (await fetch(`${root}/documents`, { headers })).json()).data.documents.length, 5);
  const post = (path, body) => fetch(root + path, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/query', { question: '' })).status, 400);
  assert.equal((await post('/query', { question: 'Firmware?', projectId: 'other' })).status, 400);
  const result = await (await post('/query', { question: 'Who completed the firmware?' })).json();
  assert.equal(result.data.citations[0].filename, 'firmware.pdf');
  assert.equal((await (await post('/contributions/query', { person: 'Darun' })).json()).data.reviewRequired, true);
  assert.equal((await post(`/documents/${docs[0].id}/reprocess`, {})).status, 200);
  assert.equal((await fetch(`${base}/api/projects/club-b/athene/documents`, { headers })).status, 404);
  assert.equal((await fetch(`${root}/documents`, { method: 'POST', headers })).status, 400);
  const tooMany = new FormData(); for (let i = 0; i < 6; i++) tooMany.append('files', new Blob([sample[0].buffer], { type: 'application/pdf' }), `${i}.pdf`);
  assert.equal((await fetch(`${root}/documents`, { method: 'POST', headers, body: tooMany })).status, 400);
  const tooLarge = new FormData(); tooLarge.append('files', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'large.pdf');
  assert.equal((await fetch(`${root}/documents`, { method: 'POST', headers, body: tooLarge })).status, 413);
});

test('Athena upload route is mounted before the generic 404 handler and receives multipart uploads', async t => {
  const { service } = testService();
  const localConfig = { ...config, ATHENE_ENABLED: true, ATHENE_DEV_TOKEN: 't'.repeat(32), ATHENE_DEV_MEMBER_ID: 'officer' };
  const base = await listen(t, createApp({ config: localConfig, athene: { service } }));
  const route = `${base}/api/projects/club-a/athene/documents`;
  const unauthenticated = await fetch(route);
  assert.notEqual(unauthenticated.status, 404);
  assert.equal(unauthenticated.status, 401);
  const form = new FormData(); form.append('files', new Blob([sample[0].buffer], { type: sample[0].mimetype }), sample[0].originalname);
  const uploaded = await fetch(route, { method: 'POST', headers: { Authorization: `Bearer ${localConfig.ATHENE_DEV_TOKEN}` }, body: form });
  assert.notEqual(uploaded.status, 404);
  assert.equal(uploaded.status, 200);
  const payload = await uploaded.json();
  assert.equal(payload.data.documents.length, 1);
  assert.equal((await fetch(`${base}/api/projects/club-a/athene/documents`, { headers: { Authorization: `Bearer ${localConfig.ATHENE_DEV_TOKEN}` } })).status, 200);
});
