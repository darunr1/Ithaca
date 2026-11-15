import { randomUUID } from 'node:crypto';
import { fail } from './errors.js';
import { hash, pipelineProfile } from './chunking.js';
import { validateVector } from './gemini.js';

export const COLLECTIONS = { documents: 'atheneDocuments', chunks: 'atheneChunks', files: 'atheneFiles', insights: 'atheneInsights' };
export function vectorDefinition(config) {
  return { fields: [
    { type: 'vector', path: 'embedding', numDimensions: config.EMBEDDING_DIMENSIONS, similarity: 'cosine' },
    { type: 'filter', path: 'projectId' }, { type: 'filter', path: 'profile' }
  ] };
}
export async function setupAthene(db, config, createVector = false) {
  const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name));
  for (const name of Object.values(COLLECTIONS)) if (!names.has(name)) await db.createCollection(name);
  const documents = db.collection(COLLECTIONS.documents); const chunks = db.collection(COLLECTIONS.chunks);
  const insights = db.collection(COLLECTIONS.insights);
  await insights.createIndex({ id: 1 }, { unique: true });
  await insights.createIndex({ projectId: 1, createdAt: -1 });
  await documents.createIndex({ id: 1 }, { unique: true });
  await documents.createIndex({ projectId: 1, contentHash: 1 }, { unique: true });
  await documents.createIndex({ projectId: 1, uploadedAt: -1 });
  await chunks.createIndex({ projectId: 1, documentId: 1, runId: 1, chunkId: 1 }, { unique: true });
  await chunks.createIndex({ projectId: 1, documentId: 1, profile: 1, chunkId: 1 });
  if (createVector) {
    const indexes = await chunks.listSearchIndexes(config.MONGODB_VECTOR_INDEX).toArray();
    if (!indexes.length) await chunks.createSearchIndex({ name: config.MONGODB_VECTOR_INDEX, type: 'vectorSearch', definition: vectorDefinition(config) });
    else checkIndex(indexes[0], config, false);
  }
}
export function checkIndex(index, config, requireReady = true) {
  if (!index || (requireReady && (!index.queryable || index.status !== 'READY'))) throw fail(503, 'VECTOR_INDEX_NOT_READY', 'Atlas Vector Search index is missing or not READY. Run athene:setup and wait for Atlas indexing.');
  const fields = index.latestDefinition?.fields ?? index.definition?.fields;
  if (index.type !== 'vectorSearch' || !fields?.some(f => f.type === 'vector' && f.path === 'embedding' && f.numDimensions === config.EMBEDDING_DIMENSIONS && f.similarity === 'cosine') || !['projectId', 'profile'].every(path => fields.some(f => f.type === 'filter' && f.path === path))) {
    throw fail(503, 'VECTOR_INDEX_MISMATCH', 'Atlas index dimensions, metric or filters differ from Athene configuration. Update the index and reprocess documents.');
  }
}

export function createAtheneRepository(db, config) {
  const documents = db.collection(COLLECTIONS.documents); const chunks = db.collection(COLLECTIONS.chunks); const files = db.collection(COLLECTIONS.files); const insights = db.collection(COLLECTIONS.insights);
  const options = { maxTimeMS: 10000, timeoutMS: 15000 };
  async function database(call) {
    try { return await call(); }
    catch (error) { if (error.status) throw error; throw fail(503, 'DATABASE_UNAVAILABLE', 'Athene database operation failed. Check MongoDB connectivity and permissions.'); }
  }
  const api = {
    get(projectId, id) { return database(() => documents.findOne({ projectId, id }, options)); },
    list(projectId, before) { return database(() => documents.find({ projectId, ...(before ? { id: { $lt: before } } : {}) }, { ...options, projection: { _id: 0, leaseId: 0 } }).sort({ id: -1 }).limit(100).toArray()); },
    async register(projectId, uploaderId, file) {
      const contentHash = hash(file.buffer); const id = hash(JSON.stringify([projectId, contentHash]));
      const record = { id, projectId, uploaderId, filename: file.originalname.replace(/.*[\\/]/, '').replace(/[\x00-\x1f]/g, '').slice(0, 200), mimeType: file.mimetype, size: file.buffer.length, contentHash, uploadedAt: new Date().toISOString(), status: 'pending', error: null, chunkCount: 0 };
      return database(async () => {
        try { await documents.updateOne({ projectId, contentHash }, { $setOnInsert: record }, { ...options, upsert: true }); }
        catch (error) { if (error.code !== 11000) throw error; }
        // Separate BSON source record is bounded to 5 MiB, below MongoDB's 16 MiB limit.
        await files.updateOne({ _id: id }, { $setOnInsert: { projectId, buffer: file.buffer } }, { ...options, upsert: true });
        return api.get(projectId, id);
      });
    },
    source(projectId, id) { return database(async () => {
      const file = await files.findOne({ _id: id, projectId }, options);
      if (!file) throw fail(422, 'SOURCE_UNAVAILABLE', 'Stored upload is unavailable; upload the original file again.');
      return Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer.buffer);
    }); },
    claim(projectId, id) { return database(() => documents.findOneAndUpdate({ projectId, id, $or: [{ status: { $ne: 'processing' } }, { leaseUntil: { $lt: new Date() } }] }, { $set: { status: 'processing', leaseId: randomUUID(), leaseUntil: new Date(Date.now() + 240000), error: null } }, { ...options, returnDocument: 'after' })); },
    cached(projectId, documentId) { return database(() => chunks.find({ projectId, documentId }, options).limit(4000).toArray()); },
    retireRuns(projectId, documentId, runIds) { return runIds.length ? database(() => chunks.deleteMany({ projectId, documentId, runId: { $in: runIds } }, options)) : Promise.resolve(); },
    saveChunks(records) { return database(() => chunks.bulkWrite(records.map(record => ({ updateOne: { filter: { _id: hash(JSON.stringify([record.documentId, record.runId, record.chunkId])) }, update: { $setOnInsert: record }, upsert: true } })), { ...options, ordered: false })); },
    async complete(record, details) { return database(async () => {
      const result = await documents.updateOne({ projectId: record.projectId, id: record.id, status: 'processing', leaseId: record.leaseId, leaseUntil: { $gt: new Date() } }, { $set: { ...details, activeRunId: record.leaseId, status: 'ready', error: null, processedAt: new Date().toISOString() }, $unset: { leaseId: '', leaseUntil: '' } }, options);
      if (result.matchedCount !== 1) throw fail(409, 'PROCESSING_LEASE_LOST', 'Document processing lease expired; retry the document.');
    }); },
    markFailed(record, error) { return database(() => documents.updateOne({ projectId: record.projectId, id: record.id, leaseId: record.leaseId }, { $set: { status: 'failed', error, failedAt: new Date().toISOString() }, $unset: { leaseId: '', leaseUntil: '' } }, options)); },
    saveInsight(report) { return database(() => insights.insertOne(report, options)); },
    listInsights(projectId) { return database(() => insights.find({ projectId }, { ...options, projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(20).toArray()); },
    async reviewInsight(projectId, reportId, actorId, status, reviewNote) {
      return database(async () => {
        const result = await insights.findOneAndUpdate({ projectId, id: reportId },
          { $set: { status, reviewNote, reviewedBy: actorId, reviewedAt: new Date().toISOString() } },
          { ...options, returnDocument: 'after', projection: { _id: 0 } });
        if (!result) throw fail(404, 'INSIGHT_NOT_FOUND', 'Insight not found in your club.');
        return result;
      });
    },
    async search(projectId, vector) {
      validateVector(vector, config.EMBEDDING_DIMENSIONS);
      return database(async () => {
        checkIndex((await chunks.listSearchIndexes(config.MONGODB_VECTOR_INDEX, options).toArray())[0], config);
        const limit = config.ATHENE_TOP_K;
        const results = await chunks.aggregate([
          { $vectorSearch: { index: config.MONGODB_VECTOR_INDEX, path: 'embedding', queryVector: vector, numCandidates: Math.min(10000, limit * 80), limit: limit * 4, filter: { projectId, profile: pipelineProfile(config) } } },
          { $set: { score: { $meta: 'vectorSearchScore' } } },
          { $match: { projectId, score: { $gte: config.ATHENE_MIN_SCORE } } },
          { $lookup: { from: COLLECTIONS.documents, let: { doc: '$documentId', run: '$runId' }, pipeline: [{ $match: { projectId, status: 'ready', $expr: { $and: [{ $eq: ['$id', '$$doc'] }, { $eq: ['$activeRunId', '$$run'] }] } } }, { $project: { filename: 1 } }], as: 'source' } },
          { $unwind: '$source' }, { $limit: limit },
          { $project: { _id: 0, chunkId: 1, documentId: 1, projectId: 1, text: 1, page: 1, section: 1, score: 1, filename: '$source.filename' } }
        ], options).toArray();
        // Defense in depth; untrusted adapters and future pipeline edits must not leak tenants.
        if (results.some(r => r.projectId !== projectId)) throw fail(503, 'RETRIEVAL_SCOPE_ERROR', 'Retrieval returned invalid project scope.');
        return results;
      });
    }
  };
  return api;
}
