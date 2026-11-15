import { api, apiJson, apiUpload } from '../shared/api.js';
import { e, heading, notice } from '../shared/ui.js';

// Keep the user-facing product name Athena while matching the existing backend API slug.
// The active project is the user's actual club, never the fictional demo club.
let activeClubId = null;
const projectPath = () => `/projects/${encodeURIComponent(activeClubId)}/athene`;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ANALYSIS_MODES = [
  { id: 'snapshot', icon: '◈', name: 'Project intelligence brief', detail: 'Summarize real progress, decisions, test evidence and documented open work.' },
  { id: 'risks', icon: '△', name: 'Engineering risk review', detail: 'Investigate documented defects, validation results, blockers and mitigations.' },
  { id: 'conflicts', icon: '⇄', name: 'Cross-document consistency', detail: 'Compare specifications and reports for contradictory or changed information.' },
  { id: 'handoff', icon: '⇢', name: 'Engineer handoff', detail: 'Produce a cited onboarding brief for the next engineer or club officer.' }
];

async function renderAthena() {
  const [{ data: clubs }, { data: me }] = await Promise.all([api('/clubs'), api('/auth/me')]);
  if (!clubs.length) return '<div class="module-empty">Create or join an engineering club before using Athena’s document archive.</div>';
  if (!activeClubId || !clubs.some(club => club.id === activeClubId)) activeClubId = clubs[0].id;
  const club = clubs.find(item => item.id === activeClubId);
  const canUpload = !me.profile || club.officerIds.includes(me.profile.internalMemberId);
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
  let reports = [], reportsError = '';
  try { reports = (await api(`${projectPath()}/insights`)).data.insights || []; }
  catch (error) { reportsError = error.message; }
  const modeCards = ANALYSIS_MODES.map(mode => `<button type="button" class="athena-mode-card" data-athena-analysis="${e(mode.id)}"><span aria-hidden="true">${mode.icon}</span><strong>${e(mode.name)}</strong><small>${e(mode.detail)}</small><em>Run analysis →</em></button>`).join('');
  const reportRows = reports.map(report => `<article class="athena-report"><details><summary><div><strong>${e(report.title || report.mode)}</strong><small>${e((report.createdAt || '').slice(0, 16).replace('T', ' '))} UTC · ${e(report.status || 'open')} · ${e(report.retrieval?.documents ?? '?')} source documents</small></div><span>View evidence</span></summary><div class="athena-report-content">${answerHtml(report)}${canUpload ? `<form class="athena-report-review" data-athena-review="${e(report.id)}"><label>Officer review decision<select name="status"><option value="reviewed">Reviewed</option><option value="needs_followup">Needs follow-up</option></select></label><label>Review note (optional)<textarea name="note" maxlength="500" rows="2" placeholder="Record the next action or review outcome"></textarea></label><button type="submit">Save review</button><p role="status"></p></form>` : ''}</div></details></article>`).join('');
  const rows = documents.map(doc => `<li class="athena-document"><div><strong>${e(doc.filename)}</strong><small>${e(doc.status)}${doc.error ? ` · ${e(doc.error.message)}` : ''}</small></div>${doc.retryable ? `<button type="button" class="secondary" data-athena-retry="${e(doc.id)}">Retry</button>` : ''}</li>`).join('') || '<li class="empty">No project documents uploaded yet.</li>';
  return `<div class="module-page module-athena"><header class="module-hero"><div><span class="module-kicker">ATHENA / GEMINI + ATLAS VECTOR SEARCH</span><h1>Your project knowledge, accessible.</h1><p>Upload engineering documentation and ask evidence-grounded questions. Athena retrieves relevant passages and cites them — without inventing contributions.</p></div><div class="module-hero-symbol" aria-hidden="true">✧</div></header>
    <div class="module-context"><label for="athena-club">Active club</label><select id="athena-club">${clubs.map(item => `<option value="${e(item.id)}" ${item.id === activeClubId ? 'selected' : ''}>${e(item.name)}</option>`).join('')}</select><span>${canUpload ? 'Officer: document upload enabled' : 'Member: read and ask questions'}</span></div>
    ${documentsError ? `<div class="notice" role="alert">Documents could not load: ${e(documentsError)}</div>` : ''}
    ${canUpload ? '<div class="athena-setup-actions"><button type="button" class="module-setup-button" id="athena-initialize">Initialize Atlas Vector Search</button><button type="button" class="module-setup-button" id="athena-diagnostics">Test Gemini embeddings + Atlas</button></div><p id="athena-initialize-status" class="module-muted" role="status"></p>' : ''}
    ${session.meta.provider === 'supabase' ? '' : '<p><button id="athena-logout" type="button" class="secondary">Sign out of Athena</button></p>'}
    ${notice('Athena returns citations to your own project documents. Human review is required before any contribution is credited.')}
    <section class="module-panel athena-mission-control" aria-labelledby="athena-intelligence-title"><div class="module-panel-head"><div><span>03 / RESEARCH & ENGINEERING REVIEW</span><h2 id="athena-intelligence-title">Project intelligence workspace</h2></div></div>
      <p class="module-muted">Go beyond a single question. Athena runs multiple Atlas Vector Search retrievals, synthesizes source-backed findings, and saves reports for human review. No activity points are awarded by AI.</p>
      <div class="athena-mode-grid">${modeCards}</div><p id="athena-analysis-status" role="status" class="module-muted"></p>
      <div class="athena-reports"><div class="module-panel-head"><div><span>SHARED KNOWLEDGE</span><h2>Saved investigation reports</h2></div><span class="athena-report-count">${reports.length} recent</span></div>${reportsError ? `<p class="notice" role="alert">${e(reportsError)}</p>` : reportRows || '<p class="module-empty">No investigations saved yet. Run a review above to create the first evidence-backed report.</p>'}</div>
    </section>
    <div class="columns"><section class="panel"><p class="eyebrow">01 / PROJECT SOURCES</p><h2>Upload project documents</h2><form id="athena-upload-form" ${canUpload ? '' : 'hidden'}><div class="upload-placeholder" id="athena-dropzone" tabindex="0" role="button" aria-label="Choose project documents"><span>↥</span><h3>Choose or drop files here</h3><p>PDF, DOCX, and supported CAD metadata · under 4 MiB combined · maximum 5 files</p><label class="button" for="athena-files">Choose files</label><input id="athena-files" name="files" type="file" accept=".pdf,.docx,.step,.stp,.dxf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple required></div><button type="submit" id="athena-upload-submit">Upload documents</button><p id="athena-upload-status" class="body-copy" role="status"></p></form><ul class="athena-documents" id="athena-documents">${rows}</ul></section><section class="panel"><p class="eyebrow">02 / GROUNDED QUESTIONS</p><h2>Ask Athena</h2><form id="athena-query-form" class="search"><label class="sr-only" for="athena-question">Question</label><input id="athena-question" name="question" placeholder="Who worked on the battery firmware?" required maxlength="2000"><button type="submit">Ask</button></form><div id="athena-answer" aria-live="polite"><p class="empty">Your grounded answer will appear here with source citations.</p></div><hr><p class="eyebrow">CONTRIBUTION EVIDENCE</p><form id="athena-contribution-form" class="search"><label class="sr-only" for="athena-person">Person</label><input id="athena-person" name="person" placeholder="Person, e.g. Darun" maxlength="120" required><input name="question" placeholder="What did they contribute?" maxlength="2000"><button type="submit">Analyze</button></form><div id="athena-contribution-answer" aria-live="polite"></div></section></div></div>`;
}

const formatCitation = citation => `<details class="athena-citation"><summary>${e(citation.filename)}${citation.page ? ` · page ${e(citation.page)}` : ''}${citation.section ? ` · ${e(citation.section)}` : ''}</summary><small>Source: ${e(citation.sourceId)}</small></details>`;
function answerHtml(result) {
  const citations = new Map((result.citations || []).map(item => [item.sourceId, item]));
  const claims = (result.statements || []).map((statement, index) => `<article class="athena-claim"><div class="athena-claim-heading"><span>Finding ${index + 1}</span><small>${e(statement.attribution || 'not_applicable')}</small></div><p>${e(statement.text)}</p><div class="athena-claim-evidence">${(statement.evidence || []).map(evidence => { const source = citations.get(evidence.sourceId); return `<blockquote><p>“${e(evidence.quote)}”</p><footer>${e(source?.filename || evidence.sourceId)}${source?.page ? ` · page ${e(source.page)}` : ''}${source?.section ? ` · ${e(source.section)}` : ''}</footer></blockquote>`; }).join('')}</div></article>`).join('');
  const notices = `${result.insufficientEvidence ? '<div class="notice" role="status">The retrieved passages do not fully support this answer. Upload additional evidence or investigate the missing information.</div>' : ''}${result.conflictingEvidence ? '<div class="notice" role="status">Conflicting accounts were found. Review the cited passages before acting.</div>' : ''}`;
  const coverage = result.retrieval ? `<p class="athena-coverage">Retrieved ${e(result.retrieval.retrievedChunks ?? 0)} passage(s)${result.retrieval.documents === undefined ? '' : ` across ${e(result.retrieval.documents)} document(s)`} with MongoDB Atlas Vector Search.</p>` : '';
  return `${coverage}${claims || `<p class="body-copy">${e(result.answer || 'There are no supported findings yet.')}</p>`}${notices}<details class="athena-citation-list"><summary>Source references (${citations.size})</summary><div class="athena-citations">${[...citations.values()].map(formatCitation).join('') || '<p class="empty">No citations found.</p>'}</div></details>`;
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
  document.querySelector('#athena-diagnostics')?.addEventListener('click', async event => {
    const button = event.currentTarget, output = document.querySelector('#athena-initialize-status');
    button.disabled = true;
    output.textContent = 'Testing the live Gemini embedding API and Atlas search index…';
    try {
      const { data } = await apiJson(`${projectPath()}/diagnostics`, {});
      output.textContent = `Gemini embeddings: ${data.embeddings}. Atlas index: ${data.vectorIndex}${data.vectorQueryable ? ' (ready).' : ' (not ready yet).'} ${data.note}`;
    } catch (error) { output.textContent = `Integration check failed: ${error.message}`; }
    finally { button.disabled = false; }
  });
  document.querySelectorAll('[data-athena-analysis]').forEach(button => button.addEventListener('click', async () => {
    const status = document.querySelector('#athena-analysis-status');
    const mode = button.dataset.athenaAnalysis;
    document.querySelectorAll('[data-athena-analysis]').forEach(control => { control.disabled = true; });
    status.textContent = 'Searching across project documents, comparing evidence and saving the report…';
    try {
      await apiJson(`${projectPath()}/insights`, { mode });
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) {
      status.textContent = error.message || 'Unable to run the review.';
      document.querySelectorAll('[data-athena-analysis]').forEach(control => { control.disabled = false; });
    }
  }));
  document.querySelectorAll('[data-athena-review]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]'), status = form.querySelector('[role="status"]');
    button.disabled = true; status.textContent = 'Saving review…';
    try {
      await apiJson(`${projectPath()}/insights/${encodeURIComponent(form.dataset.athenaReview)}/review`, Object.fromEntries(new FormData(form)));
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  }));
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
