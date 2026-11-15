import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const pipelineProfile = config => hash(JSON.stringify(['athene-v1', config.GEMINI_EMBEDDING_MODEL, config.EMBEDDING_DIMENSIONS, config.ATHENE_CHUNK_SIZE, config.ATHENE_CHUNK_OVERLAP]));

export function chunkSections(sections, { documentId, size = 1400, overlap = 200 }) {
  if (!Number.isInteger(size) || !Number.isInteger(overlap) || size <= overlap || overlap < 0) throw new Error('Invalid chunk configuration.');
  const chunks = [];
  for (const [sectionIndex, source] of sections.entries()) {
    const text = source.text.replace(/\r\n/g, '\n').replace(/[\t ]+/g, ' ').trim();
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const candidate = text.slice(start, end);
        const boundary = [candidate.lastIndexOf('\n\n'), Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('; ')), candidate.lastIndexOf(' ')].find(value => value > size * 0.6) ?? -1;
        if (boundary > size * 0.6) end = start + boundary + 1;
      }
      const content = text.slice(start, end).trim();
      if (content) chunks.push({ chunkId: hash(JSON.stringify([documentId, sectionIndex, start, content])), text: content, page: source.page ?? null, section: source.section ?? null, ordinal: chunks.length });
      if (end === text.length) break;
      start = Math.max(start + 1, end - overlap);
      // Keep the overlap on a word boundary when possible, without skipping new text.
      if (start > 0 && /\S/.test(text[start - 1]) && /\S/.test(text[start])) {
        const boundary = text.indexOf(' ', start);
        if (boundary >= start && boundary < end) start = boundary + 1;
      }
    }
  }
  return chunks;
}
