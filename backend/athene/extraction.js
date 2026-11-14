import { extname } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { PDFParse } from 'pdf-parse';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { fail } from './errors.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200000;
const formats = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.step': ['application/step', 'application/octet-stream', 'text/plain'],
  '.stp': ['application/step', 'application/octet-stream', 'text/plain'],
  '.dxf': ['image/vnd.dxf', 'application/dxf', 'application/octet-stream', 'text/plain']
};
export function validateFile(file) {
  if (!file?.buffer?.length) throw fail(422, 'EMPTY_FILE', 'The file is empty.');
  if (file.buffer.length > MAX_FILE_BYTES) throw fail(413, 'FILE_TOO_LARGE', 'Each document must be at most 5 MiB.');
  const extension = extname(file.originalname).toLowerCase();
  if (!formats[extension]?.includes(file.mimetype)) throw fail(415, 'UNSUPPORTED_FILE', 'Use PDF, DOCX, textual STEP or ASCII DXF with a matching content type. CAD geometry, DWG, STL and native CAD formats are unsupported.');
  return extension;
}

function readXml(bytes) {
  const xml = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw fail(422, 'INVALID_DOCX', 'Invalid or unsafe Word XML.');
  return new XMLParser({ preserveOrder: true, ignoreAttributes: false, removeNSPrefix: true, trimValues: false, parseTagValue: false, processEntities: true }).parse(xml);
}
function plain(nodes) {
  return nodes.map(node => typeof node['#text'] === 'string' ? node['#text'] : Object.entries(node).filter(([key]) => key !== ':@').map(([key, value]) => ['tab', 'br', 'cr'].includes(key) ? ' ' : Array.isArray(value) ? plain(value) : '').join('')).join('');
}
function paragraphs(nodes, output = []) {
  for (const node of nodes) for (const [tag, value] of Object.entries(node)) {
    if (tag === 'p') output.push(value);
    else if (Array.isArray(value)) paragraphs(value, output);
  }
  return output;
}
function paragraphStyle(nodes) {
  for (const node of nodes) {
    if (node.pStyle) return node[':@']?.['@_val'] || '';
    for (const value of Object.values(node)) if (Array.isArray(value)) { const found = paragraphStyle(value); if (found) return found; }
  }
  return '';
}

export async function extractFile(file) {
  file = { ...file, buffer: Buffer.from(file.buffer) };
  const extension = validateFile(file);
  let sections = []; const warnings = [];
  try {
    if (extension === '.pdf') {
      if (file.buffer.subarray(0, 5).toString() !== '%PDF-') throw fail(422, 'INVALID_PDF', 'Invalid PDF signature.');
      const parser = new PDFParse({ data: file.buffer });
      try {
        const result = await parser.getText();
        sections = result.pages.map(page => ({ text: page.text, page: page.num, section: null }));
      } finally { await parser.destroy(); }
      warnings.push('Text extraction only; scanned pages require OCR. PDF reading order may differ from visual layout.');
    } else if (extension === '.docx') {
      if (file.buffer.subarray(0, 2).toString() !== 'PK') throw fail(422, 'INVALID_DOCX', 'DOCX must be a valid Word ZIP archive.');
      let total = 0; let count = 0;
      const files = unzipSync(file.buffer, { filter(entry) {
        total += entry.originalSize; count++;
        if (total > 20 * 1024 * 1024 || count > 1000) throw fail(422, 'DOCX_EXPANSION_LIMIT', 'Word archive expands beyond the supported limit.');
        return entry.name === 'word/document.xml';
      } });
      if (!files['word/document.xml']) throw fail(422, 'INVALID_DOCX', 'Missing Word document content.');
      let section = null; let text = '';
      for (const p of paragraphs(readXml(files['word/document.xml']))) {
        const line = plain(p).trim();
        if (!line) continue;
        if (/^(heading[1-9]|title)$/i.test(paragraphStyle(p))) {
          if (text) sections.push({ text, section, page: null });
          section = line; text = line;
        } else text += `\n${line}`;
      }
      if (text) sections.push({ text, section, page: null });
      warnings.push('DOCX has no reliable rendered page numbers; standard heading styles are retained. Headers, footers and images are not extracted.');
    } else {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
      if (text.includes('\0')) throw fail(422, 'BINARY_CAD', 'Only textual STEP and ASCII DXF metadata are supported.');
      if (extension === '.step' || extension === '.stp') {
        const header = /^\s*ISO-10303-21;\s*HEADER;([\s\S]*?)ENDSEC;/i.exec(text);
        if (!header || !/END-ISO-10303-21;\s*$/i.test(text)) throw fail(422, 'INVALID_STEP', 'Invalid textual STEP exchange file.');
        const metadata = header[1].match(/FILE_(?:DESCRIPTION|NAME|SCHEMA)\s*\([\s\S]*?\);/gi) || [];
        sections = [{ text: metadata.join('\n'), section: 'STEP header metadata', page: null }];
      } else {
        const lines = text.replace(/\r/g, '').trim().split('\n');
        if (lines.length % 2 || !/\n\s*EOF\s*$/.test(text)) throw fail(422, 'INVALID_DXF', 'Invalid ASCII DXF group pairs.');
        let inHeader = false; let headerVar = ''; const metadata = [];
        for (let i = 0; i < lines.length; i += 2) {
          const code = lines[i].trim(); const value = lines[i + 1].trim();
          if (!/^\d+$/.test(code)) throw fail(422, 'INVALID_DXF', 'Invalid DXF group code.');
          if (code === '2' && value === 'HEADER') inHeader = true;
          if (code === '0' && value === 'ENDSEC') inHeader = false;
          if (code === '999') metadata.push(`Comment: ${value}`);
          if (inHeader && code === '9') headerVar = value;
          else if (inHeader && headerVar && ['1', '3', '40', '70'].includes(code)) metadata.push(`${headerVar}: ${value}`);
        }
        sections = [{ text: metadata.join('\n'), section: 'DXF header and comments', page: null }];
      }
      warnings.push('CAD metadata only. Geometry, assembly relationships, authorship and completion of engineering work are not inferred.');
    }
  } catch (error) {
    if (error.status) throw error;
    throw fail(422, /password|encrypt/i.test(error.name + error.message) ? 'ENCRYPTED_FILE' : 'MALFORMED_FILE', 'Unable to extract this document. It may be malformed, encrypted or use an unsupported encoding.');
  }
  sections = sections.filter(s => s.text.trim());
  const length = sections.reduce((sum, s) => sum + s.text.length, 0);
  if (!length) throw fail(422, 'NO_TEXT', 'No searchable text or supported metadata found. Scanned PDFs require OCR.');
  if (length > MAX_TEXT_CHARS) throw fail(422, 'TEXT_TOO_LARGE', 'Extracted text exceeds 200,000 characters; split the document.');
  return { sections, warnings };
}

// Isolate untrusted parsers, cap execution time, and avoid blocking HTTP requests.
export function extractInWorker(file, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./extraction.js', import.meta.url), { workerData: file, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    const done = (error, result) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); void worker.terminate(); error ? reject(error) : resolve(result); };
    const abort = () => done(fail(504, 'PROCESSING_TIMEOUT', 'Document processing timed out. Retry or split the document.'));
    const timer = setTimeout(abort, 30000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', result => result.error ? done(fail(422, result.error.code, result.error.message)) : done(null, result));
    worker.once('error', () => done(fail(422, 'PARSER_FAILED', 'Document parser failed or exceeded resource limits.')));
    worker.once('exit', code => { if (code !== 0) done(fail(422, 'PARSER_FAILED', 'Document parser stopped before extraction completed.')); });
    if (signal?.aborted) abort();
  });
}
if (!isMainThread) {
  try { parentPort.postMessage(await extractFile(workerData)); }
  catch (error) { parentPort.postMessage({ error: { code: error.code || 'MALFORMED_FILE', message: error.message } }); }
}
