import { getAccessToken, loadSupabase } from './supabase.js';
import { api } from './shared/api.js';
import { e } from './shared/ui.js';

const MAX_RESUME_BYTES = 2 * 1024 * 1024;
const classificationLabels = { freshman: 'Freshman', sophomore: 'Sophomore', junior: 'Junior', senior: 'Senior', graduate: 'Graduate student' };

async function uploadResume(file) {
  if (!file) return null;
  if (file.size > MAX_RESUME_BYTES) throw new Error('Choose a resume smaller than 2 MB.');
  if (!/\.(pdf|docx)$/i.test(file.name)) throw new Error('Choose a PDF or DOCX resume.');
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in again before uploading your resume.');
  const form = new FormData();
  form.append('resume', file);
  const response = await fetch('/api/auth/resume', {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: form
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || 'Resume upload failed.');
  return payload.data.resume;
}

async function downloadResume() {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to download your resume.');
  const response = await fetch('/api/auth/resume', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error?.message || 'Unable to download the resume.');
  }
  const file = await response.blob();
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = response.headers.get('Content-Type')?.includes('pdf') ? 'ithaca-resume.pdf' : 'ithaca-resume.docx';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindUniversitySearch() {
  const search = document.querySelector('#onboarding-university');
  const suggestions = document.querySelector('#onboarding-university-list');
  let request = 0;
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    const query = search.value.trim();
    if (query.length < 2) { suggestions.replaceChildren(); return; }
    const current = ++request;
    timer = setTimeout(async () => {
      try {
        const result = await api(`/auth/university-search?q=${encodeURIComponent(query)}`);
        if (current !== request || search.value.trim() !== query) return;
        suggestions.replaceChildren(...result.data.universities.map(university => {
          const option = document.createElement('option');
          option.value = university.name;
          option.label = university.location ? `${university.name} · ${university.location}` : university.name;
          return option;
        }));
      } catch { /* University is free-text; suggestions must not block registration. */ }
    }, 220);
  });
}

function onboarding(profile) {
  const year = new Date().getFullYear();
  const classificationOptions = Object.entries(classificationLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  document.querySelector('#content').innerHTML = `<section class="panel onboarding">
    <p class="eyebrow">STEP 2 OF 2 · CREATE YOUR PROFILE</p>
    <h1>Tell us about your engineering journey.</h1>
    <p class="body-copy">Choose your school and academic classification, then optionally add a resume. Your resume stays private, and clubs or recruiter access are never assigned automatically.</p>
    <form id="onboarding-form">
      <label for="onboarding-university">University or college</label>
      <input id="onboarding-university" name="universityName" type="text" list="onboarding-university-list" placeholder="Start typing your university (e.g. UT Dallas)" minlength="2" maxlength="160" autocomplete="organization" required>
      <datalist id="onboarding-university-list"></datalist>
      <label for="onboarding-classification">Academic classification</label>
      <select id="onboarding-classification" name="classification" required><option value="">Select your year</option>${classificationOptions}</select>
      <label for="onboarding-major">Major</label>
      <input id="onboarding-major" name="major" required minlength="2" maxlength="120" placeholder="Computer Engineering">
      <label for="onboarding-year">Expected graduation year</label>
      <input id="onboarding-year" name="graduationYear" type="number" min="${year}" max="${year + 12}" placeholder="${year + 3}" required>
      <label for="onboarding-resume">Resume <span class="optional-label">(optional)</span></label>
      <input id="onboarding-resume" name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      <p class="file-help">PDF or DOCX · up to 2 MB · stored privately in your Ithaca account</p>
      <button type="submit">Save profile &amp; enter Ithaca</button>
      <p id="onboarding-status" role="status" aria-live="polite"></p>
    </form>
  </section>`;
  document.querySelector('#identity-name').textContent = profile.name;
  document.querySelector('#identity-detail').textContent = 'Complete your profile';
  bindUniversitySearch();
  document.querySelector('#onboarding-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#onboarding-status');
    const button = form.querySelector('button[type="submit"]');
    const resume = form.querySelector('#onboarding-resume').files[0];
    button.disabled = true;
    status.textContent = 'Saving your engineering profile…';
    try {
      const values = Object.fromEntries(new FormData(form));
      delete values.resume;
      if (resume) {
        status.textContent = 'Uploading resume securely…';
        await uploadResume(resume);
      }
      status.textContent = 'Saving your university and academic year…';
      await api('/auth/onboarding', { method: 'POST', body: values });
      location.reload();
    } catch (error) {
      status.textContent = error.message || 'Could not finish your profile. Try again.';
      button.disabled = false;
    }
  });
}

function unassignedProfile(profile) {
  document.querySelector('#content').innerHTML = `<section class="panel onboarding">
    <p class="eyebrow">YOUR ITHACA PROFILE</p>
    <h1>Your account is ready.</h1>
    <p class="body-copy">${e(profile.universityName || 'University not specified')} · ${e(classificationLabels[profile.classification] || 'Student')} · ${e(profile.major || '')} · Class of ${e(profile.graduationYear || '')}</p>
    <p>A club administrator can add member ID <code>${e(profile.internalMemberId)}</code> to a club before project documents and recruiter features become available.</p>
    <hr>
    <h2>Your resume</h2>
    <p class="body-copy">${profile.resume ? `Saved privately: <strong>${e(profile.resume.filename)}</strong>` : 'No resume uploaded yet.'}</p>
    ${profile.resume ? '<button id="download-resume" type="button" class="secondary">Download resume</button>' : ''}
    <form id="resume-update-form">
      <label for="resume-update">Upload or replace your resume</label>
      <input id="resume-update" name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>
      <p class="file-help">PDF or DOCX · maximum 2 MB. Only you can access the saved file.</p>
      <button type="submit">Save resume</button>
      <p id="resume-update-status" role="status" aria-live="polite"></p>
    </form>
  </section>`;
  document.querySelector('#download-resume')?.addEventListener('click', async () => {
    try { await downloadResume(); } catch (err) { document.querySelector('#resume-update-status').textContent = err.message; }
  });
  document.querySelector('#resume-update-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const status = document.querySelector('#resume-update-status');
    button.disabled = true;
    status.textContent = 'Uploading resume…';
    try { await uploadResume(document.querySelector('#resume-update').files[0]); location.reload(); }
    catch (error) { status.textContent = error.message || 'Resume upload failed.'; button.disabled = false; }
  });
}

try {
  const supabase = await loadSupabase();
  if (!supabase) {
    document.body.classList.add('demo-mode');
    document.querySelector('#workspace-footer-note').textContent = 'Fictional local demo mode';
    await import('./app.js');
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { location.replace(`/login?redirect=${encodeURIComponent(location.href)}`); throw new Error('Redirecting to login.'); }
    const logout = document.querySelector('#logout');
    logout.hidden = false;
    logout.addEventListener('click', async () => { logout.disabled = true; await supabase.auth.signOut(); location.replace('/'); });
    const { data: me } = await api('/auth/me');
    const { profile } = me;
    document.querySelector('#identity-name').textContent = profile.name;
    document.querySelector('#identity-avatar').textContent = profile.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
    document.querySelector('#identity-detail').textContent = profile.onboarded
      ? [classificationLabels[profile.classification], profile.universityName || profile.universityId].filter(Boolean).join(' · ')
      : 'Complete your profile';
    if (me.onboardingRequired) onboarding(profile);
    else if (!profile.clubIds.length) unassignedProfile(profile);
    else await import('./app.js');
  }
} catch (error) {
  document.querySelector('#content').innerHTML = `<div class="notice" role="alert">${e(error.message)}</div><p><a class="button" href="/login">Return to login</a></p>`;
}
