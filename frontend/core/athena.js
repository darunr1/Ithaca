import { api, apiJson, apiUpload } from '../shared/api.js';
import { e, heading, notice } from '../shared/ui.js';

const projectPath = '/projects/club-rocketry/athena';

async function renderAthena() {
  let documents = [];
  try { documents = (await api(`${projectPath}/documents`)).data.documents || []; } catch { /* The page remains usable for setup/auth errors. */ }
  const rows = documents.map(doc => `<li class="athena-document"><div><strong>${e(doc.filename)}</strong><small>${e(doc.status)}${doc.error ? ` · ${e(doc.error.message)}` : ''}</small></div>${doc.retryable ? `<button type="button" class="secondary" data-athena-retry="${e(doc.id)}">Retry</button>` : ''}</li>`).join('') || '<li class="empty">No project documents uploaded yet.</li>';
  return `${heading('ATHENA / YOUR GUIDE', 'Ask questions about the project record.', 'Source-grounded answers from the documents your club has uploaded.')}${notice('Athena answers from authorized project documents and cites the source material. Contribution proposals and approvals belong in the Kleos Ledger.')}
    <div class="columns"><section class="panel"><p class="eyebrow">01 / PROJECT SOURCES</p><h2>Upload project documents</h2><form id="athena-upload-form"><div class="upload-placeholder" id="athena-dropzone" tabindex="0" role="button" aria-label="Choose project documents"><span>↥</span><h3>Choose or drop files here</h3><p>PDF, DOCX, and supported CAD metadata · up to 5 MB each · maximum 5 files</p><label class="button" for="athena-files">Choose files</label><input id="athena-files" name="files" type="file" accept=".pdf,.docx,.step,.stp,.dxf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple required></div><button type="submit" id="athena-upload-submit">Upload documents</button><p id="athena-upload-status" class="body-copy" role="status"></p></form><ul class="athena-documents" id="athena-documents">${rows}</ul></section><section class="panel"><p class="eyebrow">02 / GROUNDED QUESTIONS</p><h2>Ask Athena</h2><form id="athena-query-form" class="search"><label class="sr-only" for="athena-question">Question</label><input id="athena-question" name="question" placeholder="Who worked on the battery firmware?" required maxlength="2000"><button type="submit">Ask</button></form><div id="athena-answer" aria-live="polite"><p class="empty">Your grounded answer will appear here with source citations.</p></div><hr><p class="eyebrow">CONTRIBUTION EVIDENCE</p><form id="athena-contribution-form" class="search"><label class="sr-only" for="athena-person">Person</label><input id="athena-person" name="person" placeholder="Person, e.g. Darun" maxlength="120" required><input name="question" placeholder="What did they contribute?" maxlength="2000"><button type="submit">Analyze</button></form><div id="athena-contribution-answer" aria-live="polite"></div></section></div>`;
}

const formatCitation = citation => `<details class="athena-citation"><summary>${e(citation.filename)}${citation.page ? ` · page ${e(citation.page)}` : ''}${citation.section ? ` · ${e(citation.section)}` : ''}</summary><small>Source: ${e(citation.sourceId)}</small></details>`;
function answerHtml(result) {
  const citations = (result.citations || []).map(formatCitation).join('');
  return `<p class="body-copy">${e(result.answer || 'No answer was returned.')}</p>${result.insufficientEvidence ? '<div class="notice" role="status">The uploaded documents do not contain enough evidence to answer this fully.</div>' : ''}${result.conflictingEvidence ? '<div class="notice" role="status">The retrieved documents contain conflicting information. Review the cited sources.</div>' : ''}<div class="athena-citations"><h3>Sources</h3>${citations || '<p class="empty">No sources were cited.</p>'}</div>`;
}

function bindAthena() {
  if (typeof document === 'undefined') return renderAthena();
  const filesInput = document.querySelector('#athena-files');
  const dropzone = document.querySelector('#athena-dropzone');
  const uploadForm = document.querySelector('#athena-upload-form');
  const submitButton = document.querySelector('#athena-upload-submit');
  const status = document.querySelector('#athena-upload-status');
  let selectedFiles = [];
  const chooseFiles = files => { if (files.length > 5) { selectedFiles = []; status.textContent = 'Choose no more than five files.'; return; } selectedFiles = files; status.textContent = `${files.length} file${files.length === 1 ? '' : 's'} selected. Click Upload documents to submit.`; };
  filesInput?.addEventListener('change', () => chooseFiles([...filesInput.files]));
  ['dragenter', 'dragover'].forEach(type => dropzone?.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => dropzone?.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('dragging'); }));
  dropzone?.addEventListener('drop', event => chooseFiles([...event.dataTransfer.files]));
  dropzone?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); filesInput?.click(); } });
  uploadForm?.addEventListener('submit', async event => {
    event.preventDefault(); const files = selectedFiles;
    if (!files.length) { status.textContent = 'Choose at least one document first.'; return; }
    submitButton.disabled = true; status.textContent = `Uploading ${files.length} file${files.length === 1 ? '' : 's'} and processing…`;
    try { const result = await apiUpload(`${projectPath}/documents`, files); status.textContent = result.data.documents.map(doc => `${doc.filename}: ${doc.status}${doc.error ? ` (${doc.error.message})` : ''}`).join(' · '); setTimeout(() => { window.dispatchEvent(new Event('hashchange')); }, 700); }
    catch (error) { status.textContent = error.message; }
    finally { submitButton.disabled = false; }
  });
  document.querySelectorAll('[data-athena-retry]').forEach(button => button.addEventListener('click', async () => { button.disabled = true; button.textContent = 'Retrying…'; try { await apiJson(`${projectPath}/documents/${encodeURIComponent(button.dataset.athenaRetry)}/reprocess`, {}); window.dispatchEvent(new Event('hashchange')); } catch (error) { button.disabled = false; button.textContent = error.message; } }));
  const submit = async (target, path, body) => { target.innerHTML = '<p class="loading">Athena is searching the project sources…</p>'; try { target.innerHTML = answerHtml((await apiJson(path, body)).data); } catch (error) { target.innerHTML = `<div class="notice" role="alert">${e(error.message)}</div>`; } };
  document.querySelector('#athena-query-form')?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.target); submit(document.querySelector('#athena-answer'), `${projectPath}/query`, { question: data.get('question') }); });
  document.querySelector('#athena-contribution-form')?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.target); submit(document.querySelector('#athena-contribution-answer'), `${projectPath}/contributions/query`, { person: data.get('person'), question: data.get('question') }); });
}

export { renderAthena, bindAthena };
