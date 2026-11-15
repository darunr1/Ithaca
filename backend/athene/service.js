import { authorizeProject } from './auth.js';
import { chunkSections, pipelineProfile } from './chunking.js';
import { extractInWorker, validateFile } from './extraction.js';
import { answerSchema, validateVector } from './gemini.js';
import { fail, publicFailure } from './errors.js';

export function documentView(document) {
  if (!document) throw fail(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
  const { _id, leaseId, activeRunId, ...view } = document;
  return { ...view, retryable: view.status === 'failed' || view.status === 'pending' || (view.status === 'processing' && new Date(view.leaseUntil) < new Date()) };
}
const normalize = value => value.replace(/\s+/g, ' ').trim();
const namedIn = (quote, person) => {
  const words = value => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return words(person).length > 0 && ` ${words(quote)} `.includes(` ${words(person)} `);
};
export function groundAnswer(output, sources, projectId, contribution = false) {
  try { output = answerSchema.parse(output); }
  catch { throw fail(502, 'INVALID_AI_RESPONSE', 'Gemini returned an invalid response.'); }
  const byId = new Map(sources.map(source => [source.sourceId, source]));
  const citations = new Map();
  const statements = output.statements.map(statement => {
    for (const evidence of statement.evidence) {
      const source = byId.get(evidence.sourceId);
      if (!source || !normalize(source.text).includes(normalize(evidence.quote))) throw fail(502, 'UNGROUNDED_CITATION', 'Gemini returned a source or quote that was not retrieved. Please retry.');
      citations.set(source.sourceId, { sourceId: source.sourceId, documentId: source.documentId, chunkId: source.chunkId, filename: source.filename, page: source.page, section: source.section, score: source.score });
    }
    if (statement.attribution === 'documented' && (!statement.person || !statement.evidence.some(e => namedIn(e.quote, statement.person)))) throw fail(502, 'UNGROUNDED_ATTRIBUTION', 'A documented contribution lacks a named source excerpt.');
    return statement;
  });
  const insufficientEvidence = output.insufficientEvidence || !statements.length || (contribution && !statements.some(s => s.attribution === 'documented'));
  const answer = statements.map(s => `${s.text} ${[...new Set(s.evidence.map(e => `[${e.sourceId}]`))].join(' ')}`).join('\n\n');
  return { projectId, answer: answer + (insufficientEvidence ? `${answer ? '\n\n' : ''}There is insufficient retrieved evidence to fully answer this question.` : ''), statements, citations: [...citations.values()], insufficientEvidence, conflictingEvidence: output.conflictingEvidence, reviewRequired: contribution, retrieval: { engine: 'mongodb-atlas-vector-search', retrievedChunks: sources.length } };
}

export function createAtheneService({ db, config, repository, ai, extract = extractInWorker, authorize = (memberId, projectId, write) => authorizeProject(db, memberId, projectId, write) }) {
  const profile = pipelineProfile(config);
  async function process(document, signal) {
    if (document.status === 'ready' && document.profile === profile) return { ...documentView(document), reused: true };
    const claimed = await repository.claim(document.projectId, document.id);
    if (!claimed) return { ...documentView(await repository.get(document.projectId, document.id)), reused: true };
    try {
      signal.throwIfAborted();
      const buffer = await repository.source(document.projectId, document.id);
      const { sections, warnings } = await extract({ buffer, originalname: document.filename, mimetype: document.mimeType }, signal);
      const chunks = chunkSections(sections, { documentId: document.id, size: config.ATHENE_CHUNK_SIZE, overlap: config.ATHENE_CHUNK_OVERLAP });
      if (!chunks.length || chunks.length > 500) throw fail(422, 'CHUNK_LIMIT', 'Document must produce 1–500 chunks; split it or increase chunk size.');
      const previous = await repository.cached(document.projectId, document.id);
      const cached = new Map(previous.filter(c => c.profile === profile).map(c => [c.chunkId, c.embedding]));
      for (let offset = 0; offset < chunks.length; offset += 16) {
        signal.throwIfAborted();
        const batch = chunks.slice(offset, offset + 16);
        const missing = batch.filter(c => !cached.has(c.chunkId));
        if (missing.length) {
          const embeddings = await ai.embed(missing.map(c => c.text), 'RETRIEVAL_DOCUMENT', signal);
          if (embeddings.length !== missing.length) throw fail(502, 'INVALID_EMBEDDING', 'Embedding count mismatch.');
          missing.forEach((c, i) => cached.set(c.chunkId, embeddings[i]));
        }
        await repository.saveChunks(batch.map(chunk => ({ ...chunk, projectId: document.projectId, documentId: document.id, runId: claimed.leaseId, profile, embeddingModel: config.GEMINI_EMBEDDING_MODEL, dimensions: config.EMBEDDING_DIMENSIONS, embedding: validateVector(cached.get(chunk.chunkId), config.EMBEDDING_DIMENSIONS) })));
      }
      signal.throwIfAborted();
      await repository.complete(claimed, { profile, chunkCount: chunks.length, sections: sections.map(({ page, section }) => ({ page, section })), warnings, embeddingModel: config.GEMINI_EMBEDDING_MODEL, dimensions: config.EMBEDDING_DIMENSIONS });
      // Delete only generations observed before this run; a newer worker cannot be removed.
      // A cleanup outage must not turn a successfully activated document into a failure.
      try { await repository.retireRuns?.(document.projectId, document.id, [...new Set(previous.map(c => c.runId))].filter(id => id !== claimed.leaseId)); }
      catch { /* Inactive rows remain invisible via the activeRunId join; retry cleanup on reprocessing. */ }
      return documentView(await repository.get(document.projectId, document.id));
    } catch (error) {
      const detail = signal.aborted ? { code: 'PROCESSING_TIMEOUT', message: 'Processing exceeded 180 seconds. Reprocess to reuse completed embeddings or split the document.' } : publicFailure(error);
      await repository.markFailed(claimed, detail);
      return documentView(await repository.get(document.projectId, document.id));
    }
  }
  return {
    authorize,
    async upload(memberId, projectId, files, signal = AbortSignal.timeout(180000)) {
      await authorize(memberId, projectId, true);
      if (!Array.isArray(files) || files.length < 1 || files.length > 5) throw fail(400, 'INVALID_UPLOAD_COUNT', 'Upload one to five documents using the files field.');
      const results = [];
      for (const file of files) {
        // Register bounded rejected files too, so extraction/format errors remain inspectable.
        if (!file?.buffer || file.buffer.length > 5 * 1024 * 1024) throw fail(413, 'FILE_TOO_LARGE', 'Each document must be at most 5 MiB.');
        const record = await repository.register(projectId, memberId, file);
        try { validateFile(file); }
        catch (error) {
          if (record.status === 'ready') { results.push(documentView(record)); continue; }
          const claimed = await repository.claim(projectId, record.id);
          if (claimed) await repository.markFailed(claimed, publicFailure(error));
          results.push(documentView(await repository.get(projectId, record.id))); continue;
        }
        results.push(await process(record, signal));
      }
      return results;
    },
    async reprocess(memberId, projectId, documentId, signal = AbortSignal.timeout(180000)) {
      await authorize(memberId, projectId, true);
      const document = await repository.get(projectId, documentId);
      if (!document) throw fail(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      return process(document, signal);
    },
    async list(memberId, projectId, before) { await authorize(memberId, projectId); return (await repository.list(projectId, before)).map(documentView); },
    async status(memberId, projectId, documentId) { await authorize(memberId, projectId); return documentView(await repository.get(projectId, documentId)); },
    async query(memberId, projectId, question, contribution = false, signal = AbortSignal.timeout(90000)) {
      await authorize(memberId, projectId);
      if (typeof question !== 'string' || !question.trim() || question.length > 2000) throw fail(400, 'INVALID_QUESTION', 'Question must contain 1–2,000 characters.');
      const [vector] = await ai.embed([question], 'RETRIEVAL_QUERY', signal);
      const sources = (await repository.search(projectId, vector)).map(source => ({ ...source, sourceId: `src_${source.chunkId}` }));
      if (sources.some(s => s.projectId !== projectId)) throw fail(503, 'RETRIEVAL_SCOPE_ERROR', 'Invalid project retrieval scope.');
      if (!sources.length) return groundAnswer({ statements: [], insufficientEvidence: true, conflictingEvidence: false }, [], projectId, contribution);
      const output = await ai.answer(question, sources, contribution, signal);
      // Recheck access after potentially slow API calls; membership might have changed.
      await authorize(memberId, projectId);
      return groundAnswer(output, sources, projectId, contribution);
    }
  };
}
