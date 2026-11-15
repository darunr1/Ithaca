import { api, apiJson, apiUpload } from '../shared/api.js';
import { e, heading, notice } from '../shared/ui.js';

// Keep the user-facing product name Athena while matching the existing backend API slug.
// The active project is the user's actual club, never the fictional demo club.
let activeClubId = null;
const projectPath = () => `/projects/${encodeURIComponent(activeClubId)}/athene`;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

async function renderAthena() {
  const [{ data: clubs }, { data: me }] = await Promise.all([api('/clubs'), api('/auth/me')]);
  if (!clubs.length) return '<div class="module-empty">Create or join an engineering club before using Athena’s document archive.</div>';
  if (!activeClubId || !clubs.some(club => club.id === activeClubId)) activeClubId = clubs[0].id;
  const club = clubs.find(item => item.id === activeClubId);
  const canUpload = club.officerIds.includes(me.profile.internalMemberId);
  let session;
  try {
    const identity = await api('/auth/me');
    session = identity.meta.authentication === 'supabase' ? { data: { authenticated: true }, meta: { provider: 'supabase' } } : await api('/athena-session');
  }
  catch (error) { return `${heading('ATHENA / YOUR GUIDE', 'Athena is unavailable.', 'The production authentication service could not be reached.')}<div class="notice" role="alert">${e(error.message)}</div>`; }
  if (!session.data.authenticated) {
    const login = session.meta.provider === 'access-code'
      ? `<form id="athena-login-form" class="panel auth-panel"><label for="athena-access-code">Athena access code</label><input id="athena-access-code" name="accessCode" type="password" minlength="16" maxlength="256" autocomplete="current-password" required><button type="submit">Sign in securely</button><p id="athena-login-status" role="status" class="body-copy"></p></form>`
      : '<div class="notice" role="alert">Athena requires a production identity-provider bearer session. Ask an administrator for access.</div>';
    return `${heading('ATHENA / YOUR GUIDE', 'Ask Athena after signing in.', 'Upload documents and query the archive as an authorized club member or officer.')}${login}`;
  }
  let documents = [], documentsError = '';
  try { documents = (await api(`${projectPath()}/documents`)).data.documents || []; }
  catch (error) { documentsError = error.message; }
  const rows = documents.map(doc => `<li class="athena-document"><div><strong>${e(doc.filename)}</strong><small>${e(doc.status)}${doc.error ? ` · ${e(doc.error.message)}` : ''}</small></div>${doc.retryable ? `<button type="button" class="secondary" data-athena-retry="${e(doc.id)}">Retry</button>` : ''}</li>`).join('') || '<li class="empty">No project documents uploaded yet.</li>';
  return `<div class="module-page module-athena"><header class="module-hero"><div><span class="module-kicker">ATHENA / GEMINI + ATLAS VECTOR SEARCH</span><h1>Your project knowledge, accessible.</h1><p>Upload engineering documentation and ask evidence-grounded questions. Athena retrieves relevant passages and cites them — without inventing contributions.</p></div><div class="module-hero-symbol" aria-hidden="true">✧</div></header>
    <div class="module-context"><label for="athena-club">Active club</label><select id="athena-club">${clubs.map(item => `<option value="${e(item.id)}" ${item.id === activeClubId ? 'selected' : ''}>${e(item.name)}</option>`).join('')}</select><span>${canUpload ? 'Officer: document upload enabled' : 'Member: read and ask questions'}</span></div>
    ${documentsError ? `<div class="notice" role="alert">Documents could not load: ${e(documentsError)}</div>` : ''}
    ${canUpload ? '<button type="button" class="module-setup-button" id="athena-initialize">Initialize / verify Atlas Vector Search</button><p id="athena-initialize-status" class="module-muted" role="status"></p>' : ''}
    ${session.meta.provider === 'supabase' ? '' : '<p><button id="athena-logout" type="button" class="secondary">Sign out of Athena</button></p>'}
    ${notice('Athena returns citations to your own project documents. Human review is required before any contribution is credited.')}
    <div class="columns"><section class="panel"><p class="eyebrow">01 / PROJECT SOURCES</p><h2>Upload project documents</h2><form id="athena-upload-form" ${canUpload ? '' : 'hidden'}><div class="upload-placeholder" id="athena-dropzone" tabindex="0" role="button" aria-label="Choose project documents"><span>↥</span><h3>Choose or drop files here</h3><p>PDF, DOCX, and supported CAD metadata · under 4 MiB combined · maximum 5 files</p><label class="button" for="athena-files">Choose files</label><input id="athena-files" name="files" type="file" accept=".pdf,.docx,.step,.stp,.dxf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple required></div><button type="submit" id="athena-upload-submit">Upload documents</button><p id="athena-upload-status" class="body-copy" role="status"></p></form><ul class="athena-documents" id="athena-documents">${rows}</ul></section><section class="panel"><p class="eyebrow">02 / GROUNDED QUESTIONS</p><h2>Ask Athena</h2><form id="athena-query-form" class="search"><label class="sr-only" for="athena-question">Question</label><input id="athena-question" name="question" placeholder="Who worked on the battery firmware?" required maxlength="2000"><button type="submit">Ask</button></form><div id="athena-answer" aria-live="polite"><p class="empty">Your grounded answer will appear here with source citations.</p></div><hr><p class="eyebrow">CONTRIBUTION EVIDENCE</p><form id="athena-contribution-form" class="search"><label class="sr-only" for="athena-person">Person</label><input id="athena-person" name="person" placeholder="Person, e.g. Darun" maxlength="120" required><input name="question" placeholder="What did they contribute?" maxlength="2000"><button type="submit">Analyze</button></form><div id="athena-contribution-answer" aria-live="polite"></div></section></div></div>`;
}

const formatCitation = citation => `<details class="athena-citation"><summary>${e(citation.filename)}${citation.page ? ` · page ${e(citation.page)}` : ''}${citation.section ? ` · ${e(citation.section)}` : ''}</summary><small>Source: ${e(citation.sourceId)}</small></details>`;
function answerHtml(result) {
  const citations = (result.citations || []).map(formatCitation).join('');
  return `<p class="body-copy">${e(result.answer || 'No answer was returned.')}</p>${result.insufficientEvidence ? '<div class="notice" role="status">The uploaded documents do not contain enough evidence to answer this fully.</div>' : ''}${result.conflictingEvidence ? '<div class="notice" role="status">The retrieved documents contain conflicting information. Review the cited sources.</div>' : ''}<div class="athena-citations"><h3>Sources</h3>${citations || '<p class="empty">No sources were cited.</p>'}</div>`;
}

function bindAthena() {
  if (typeof document === 'undefined') return renderAthena();
  document.querySelector('#athena-login-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const status = document.querySelector('#athena-login-status'); const button = event.target.querySelector('button');
    button.disabled = true; status.textContent = 'Signing inâ€¦';
    try { await apiJson('/athena-session', { accessCode: new FormData(event.target).get('accessCode') }); window.dispatchEvent(new Event('hashchange')); }
    catch (error) { status.textContent = error.message; button.disabled = false; }
  });
  document.querySelector('#athena-logout')?.addEventListener('click', async event => {
    event.target.disabled = true;
    try { await fetch('/api/athena-session', { method: 'DELETE', credentials: 'same-origin', headers: { Accept: 'application/json' } }); }
    finally { window.dispatchEvent(new Event('hashchange')); }
  });
  document.querySelector('#athena-club')?.addEventListener('change', event => {
    activeClubId = event.target.value;
    window.dispatchEvent(new Event('hashchange'));
  });
  document.querySelector('#athena-initialize')?.addEventListener('click', async event => {
    const button = event.currentTarget, output = document.querySelector('#athena-initialize-status');
    button.disabled = true;
    output.textContent = 'Preparing Atlas Vector Search…';
    try {
      const result = await apiJson(`${projectPath()}/initialize`, {});
      output.textContent = result.data.ready ? 'Atlas Vector Search is ready.' : result.data.note;
    } catch (error) { output.textContent = error.message; }
    finally { button.disabled = false; }
  });
  const filesInput = document.querySelector('#athena-files');
  const dropzone = document.querySelector('#athena-dropzone');
  const uploadForm = document.querySelector('#athena-upload-form');
  const submitButton = document.querySelector('#athena-upload-submit');
  const status = document.querySelector('#athena-upload-status');
  let selectedFiles = [];
  const chooseFiles = files => { if (files.length > 5) { selectedFiles = []; status.textContent = 'Choose no more than five files.'; return; } if (files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_BYTES) { selectedFiles = []; status.textContent = 'Keep the combined upload size under 4 MiB.'; return; } selectedFiles = files; status.textContent = `${files.length} file${files.length === 1 ? '' : 's'} selected. Click Upload documents to submit.`; };
  filesInput?.addEventListener('change', () => chooseFiles([...filesInput.files]));
  ['dragenter', 'dragover'].forEach(type => dropzone?.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => dropzone?.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('dragging'); }));
  dropzone?.addEventListener('drop', event => chooseFiles([...event.dataTransfer.files]));
  dropzone?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); filesInput?.click(); } });
  uploadForm?.addEventListener('submit', async event => {
    event.preventDefault(); const files = selectedFiles;
    if (!files.length) { status.textContent = 'Choose at least one document first.'; return; }
    submitButton.disabled = true; status.textContent = `Uploading ${files.length} file${files.length === 1 ? '' : 's'} and processing…`;
    try { const result = await apiUpload(`${projectPath()}/documents`, files); status.textContent = result.data.documents.map(doc => `${doc.filename}: ${doc.status}${doc.error ? ` (${doc.error.message})` : ''}`).join(' · '); setTimeout(() => { window.dispatchEvent(new Event('hashchange')); }, 700); }
    catch (error) { status.textContent = error.message; }
    finally { submitButton.disabled = false; }
  });
  document.querySelectorAll('[data-athena-retry]').forEach(button => button.addEventListener('click', async () => { button.disabled = true; button.textContent = 'Retrying…'; try { await apiJson(`${projectPath()}/documents/${encodeURIComponent(button.dataset.athenaRetry)}/reprocess`, {}); window.dispatchEvent(new Event('hashchange')); } catch (error) { button.disabled = false; button.textContent = error.message; } }));
  const submit = async (target, path, body) => { target.innerHTML = '<p class="loading">Athena is searching the project sources…</p>'; try { target.innerHTML = answerHtml((await apiJson(path, body)).data); } catch (error) { target.innerHTML = `<div class="notice" role="alert">${e(error.message)}</div>`; } };
  document.querySelector('#athena-query-form')?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.target); submit(document.querySelector('#athena-answer'), `${projectPath()}/query`, { question: data.get('question') }); });
  document.querySelector('#athena-contribution-form')?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.target); submit(document.querySelector('#athena-contribution-answer'), `${projectPath()}/contributions/query`, { person: data.get('person'), question: data.get('question') }); });
}

export { renderAthena, bindAthena };
