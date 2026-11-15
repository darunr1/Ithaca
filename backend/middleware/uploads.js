import multer from 'multer';
import { httpError } from '../services/workspace.js';
// Prepared for Darun's draft route. No upload endpoint is enabled yet.
export const notesUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3 },
  fileFilter(req, file, callback) {
    callback(['text/plain', 'application/pdf'].includes(file.mimetype) ? null : httpError(415, 'UNSUPPORTED_FILE', 'Use a text file or a text-based PDF.'), ['text/plain', 'application/pdf'].includes(file.mimetype));
  }
}).single('file');
export async function extractNotes(file) {
  if (!file) throw httpError(400, 'MISSING_FILE', 'A notes file is required.');
  let text;
  if (file.mimetype === 'application/pdf') {
    if (file.buffer.subarray(0, 5).toString() !== '%PDF-') throw httpError(400, 'INVALID_PDF', 'Invalid PDF signature.');
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: file.buffer });
    try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  } else text = file.buffer.toString('utf8');
  if (!text.trim() || text.length > 50000) throw httpError(422, 'INVALID_NOTES', 'Notes must contain 1–50,000 characters. Scanned PDFs need a future OCR workflow.');
  return text;
}
