import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { createAuthenticator } from './auth.js';
import { createAtheneGemini } from './gemini.js';
import { createAtheneRepository, setupAthene } from './repository.js';
import { createAtheneService } from './service.js';
import { fail } from './errors.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const question = z.string().trim().min(1).max(2000);
// Keep multipart requests below Vercel's 4.5 MB function request ceiling.
const MAX_REQUEST_UPLOAD_BYTES = 4 * 1024 * 1024;
export function atheneRoutes({ db, config, authenticate, service }) {
  const router = Router({ mergeParams: true });
  if (!config.ATHENE_ENABLED) {
    router.use((req, res, next) => next(fail(503, 'ATHENE_DISABLED', 'Enable Athene with live Gemini, Atlas and authentication configuration.')));
    return router;
  }
  authenticate ??= createAuthenticator(config);
  service ??= createAtheneService({ db, config, repository: createAtheneRepository(db, config), ai: createAtheneGemini(config) });
  router.use(async (req, res, next) => {
    try { req.atheneMemberId = await authenticate(req); id.parse(req.params.projectId); await service.authorize(req.atheneMemberId, req.params.projectId, req.method === 'POST' && req.path.startsWith('/documents')); next(); }
    catch (error) { next(error); }
  });
  router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.headers.origin;
    let originHost;
    try { originHost = origin && new URL(origin).host; } catch { return next(fail(403, 'CROSS_SITE_REQUEST', 'Cross-site Athena requests are not allowed.')); }
    if (req.headers['sec-fetch-site'] === 'cross-site' || (originHost && originHost !== req.headers.host)) return next(fail(403, 'CROSS_SITE_REQUEST', 'Cross-site Athena requests are not allowed.'));
    next();
  });
  // Per-process guard before buffering uploads; enforce a distributed quota at the gateway when scaling.
  let inflight = 0; const windows = new Map();
  router.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const now = Date.now();
    for (const [key, value] of windows) if (value.until <= now) windows.delete(key);
    const window = windows.get(req.atheneMemberId) || { until: now + 60000, count: 0 };
    if (inflight >= 2 || window.count >= 20) { res.set('Retry-After', '30'); return next(fail(429, 'ATHENE_BUSY', 'Athene request limit reached. Retry shortly.')); }
    window.count++; windows.set(req.atheneMemberId, window); inflight++;
    // Release when the actual work ends, even if the HTTP client disconnects early.
    req.releaseAthene = () => { if (req.releaseAthene) { inflight--; req.releaseAthene = null; } };
    next();
  });
  const send = (res, data) => res.json({ data, meta: { mode: 'atlas', fictional: false, feature: 'athene' } });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_REQUEST_UPLOAD_BYTES, files: 5, fields: 0, parts: 5 } }).array('files', 5);
  router.post('/documents', (req, res, next) => upload(req, res, async error => {
    try {
      if (error) throw fail(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code || 'INVALID_UPLOAD', error.code === 'LIMIT_FILE_SIZE' ? 'Combined uploads must fit within the 4 MiB serverless limit.' : 'Use multipart field files with one to five documents and no other fields.');
      const files = req.files || [];
      if (files.reduce((total, file) => total + file.size, 0) > MAX_REQUEST_UPLOAD_BYTES) throw fail(413, 'UPLOAD_TOO_LARGE', 'Combined upload size must be at most 4 MiB on serverless deployments.');
      const documents = await service.upload(req.atheneMemberId, req.params.projectId, req.files);
      res.status(documents.some(d => d.status === 'failed') ? 207 : documents.some(d => d.status === 'processing') ? 202 : 200);
      send(res, { documents });
    } catch (error) { next(error); }
    finally { req.releaseAthene?.(); }
  }));
  router.post('/initialize', async (req, res, next) => {
    try {
      await service.authorize(req.atheneMemberId, req.params.projectId, true);
      await setupAthene(db, config, true);
      const indexes = await db.collection('atheneChunks').listSearchIndexes(config.MONGODB_VECTOR_INDEX).toArray();
      send(res, { index: config.MONGODB_VECTOR_INDEX, ready: Boolean(indexes[0]?.queryable && indexes[0]?.status === 'READY'),
        note: 'MongoDB Atlas Vector Search indexing may take several minutes. Retry when READY.' });
    } catch (error) { next(error); }
    finally { req.releaseAthene?.(); }
  });
  router.post('/diagnostics', async (req, res, next) => {
    try {
      await service.authorize(req.atheneMemberId, req.params.projectId, true);
      // Explicit opt-in probe: validates the real Gemini key / embedding model without
      // exposing credentials or uploading any user content. Protected by the rate limiter.
      const gemini = createAtheneGemini(config);
      const vectors = await gemini.embed(['Ithaca engineering document retrieval health check'], 'RETRIEVAL_QUERY', AbortSignal.timeout(15000));
      const indexes = await db.collection('atheneChunks').listSearchIndexes(config.MONGODB_VECTOR_INDEX).toArray();
      const index = indexes[0];
      send(res, {
        embeddings: vectors.length === 1 && vectors[0].length === config.EMBEDDING_DIMENSIONS ? 'ready' : 'invalid',
        embeddingModel: config.GEMINI_EMBEDDING_MODEL,
        vectorIndex: index?.status || 'MISSING',
        vectorQueryable: Boolean(index?.queryable),
        note: 'This checks Gemini embeddings and the Atlas search index. Upload a real document and ask a cited question to verify the complete RAG flow.'
      });
    } catch (error) { next(error); }
    finally { req.releaseAthene?.(); }
  });
  router.get('/documents', async (req, res) => {
    const before = req.query.before === undefined ? undefined : id.parse(req.query.before);
    const documents = await service.list(req.atheneMemberId, req.params.projectId, before);
    send(res, { documents, nextBefore: documents.length === 100 ? documents.at(-1).id : null });
  });
  router.get('/documents/:documentId', async (req, res) => send(res, await service.status(req.atheneMemberId, req.params.projectId, id.parse(req.params.documentId))));
  router.post('/documents/:documentId/reprocess', async (req, res, next) => {
    try { const result = await service.reprocess(req.atheneMemberId, req.params.projectId, id.parse(req.params.documentId)); res.status(result.status === 'failed' ? 207 : result.status === 'processing' ? 202 : 200); send(res, result); }
    catch (error) { next(error); } finally { req.releaseAthene?.(); }
  });
  router.get('/insights', async (req, res) => {
    send(res, { insights: await service.listInsights(req.atheneMemberId, req.params.projectId) });
  });
  router.post('/insights', async (req, res, next) => {
    try {
      const { mode } = z.object({ mode: z.enum(['snapshot', 'risks', 'conflicts', 'handoff']) }).strict().parse(req.body);
      res.status(201); send(res, await service.analyze(req.atheneMemberId, req.params.projectId, mode));
    } catch (error) { next(error); } finally { req.releaseAthene?.(); }
  });
  router.post('/insights/:insightId/review', async (req, res, next) => {
    try {
      const insightId = id.parse(req.params.insightId);
      const { status, note } = z.object({
        status: z.enum(['reviewed', 'needs_followup']),
        note: z.string().trim().max(500).default('')
      }).strict().parse(req.body);
      send(res, await service.reviewInsight(req.atheneMemberId, req.params.projectId, insightId, status, note));
    } catch (error) { next(error); } finally { req.releaseAthene?.(); }
  });
  for (const contribution of [false, true]) router.post(contribution ? '/contributions/query' : '/query', async (req, res, next) => {
    try {
      const input = (contribution ? z.object({ person: z.string().trim().min(1).max(120).optional(), question: question.optional() }).strict().refine(v => v.person || v.question, 'Provide person or question.') : z.object({ question }).strict()).parse(req.body);
      const prompt = input.person ? `${input.question || 'What completed technical work is documented?'}\nAnalyze evidence specifically for ${input.person}.` : input.question;
      send(res, await service.query(req.atheneMemberId, req.params.projectId, prompt, contribution));
    } catch (error) { next(error); } finally { req.releaseAthene?.(); }
  });
  router.use((req, res, next) => { req.releaseAthene?.(); next(); });
  return router;
}
