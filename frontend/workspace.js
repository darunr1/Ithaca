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


function configureStudentShell({ locked = true, label = 'My workspace' } = {}) {
  document.body.classList.add('student-workspace');
  document.querySelector('#breadcrumb').textContent = label;
  document.querySelector('#connection').textContent = 'Secure session';
  const picker = document.querySelector('.viewing-as-picker');
  if (picker) picker.hidden = true;
  document.querySelectorAll('.sidebar nav a').forEach(link => {
    const isHome = link.dataset.page === 'home';
    if (isHome) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    if (locked && !isHome) {
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('tabindex', '-1');
      link.addEventListener('click', event => event.preventDefault());
    }
  });
}

const firstName = name => String(name || 'there').trim().split(/\s+/)[0];
const studentYear = value => classificationLabels[value] || 'Not selected';

function onboarding(profile, signupMetadata = {}, editing = false) {
  configureStudentShell({ label: editing ? 'Edit academic profile' : 'Complete your profile' });
  const currentYear = new Date().getFullYear();
  const fromSignup = signupMetadata && typeof signupMetadata === 'object' ? signupMetadata : {};
  const university = profile.universityName || (typeof fromSignup.university_name === 'string' ? fromSignup.university_name : '');
  const classification = profile.classification || (Object.hasOwn(classificationLabels, fromSignup.classification) ? fromSignup.classification : '');
  const major = profile.major || '';
  const graduationYear = profile.graduationYear || '';
  const choices = Object.entries(classificationLabels).map(([value, label]) => `<option value="${value}" ${classification === value ? 'selected' : ''}>${label}</option>`).join('');
  const content = document.querySelector('#content');
  content.innerHTML = `<div class="student-setup">
    <section class="setup-intro">
      <span class="setup-eyebrow">ITHACA / ${editing ? 'ACADEMIC RECORD' : 'FIRST-TIME SETUP'}</span>
      <h1>${editing ? 'Update your academic story.' : 'Your work deserves a place to live.'}</h1>
      <p>${editing ? 'Keep your university, major, and class year accurate as you progress.' : 'Before entering Ithaca, tell us a little about your engineering journey. This information powers your profile and stays under your control.'}</p>
      <div class="setup-milestones" aria-label="Account setup progress">
        <div><span class="milestone-done">✓</span><div><strong>Account secured</strong><small>Email verified with Supabase</small></div></div>
        <div><span class="milestone-current">02</span><div><strong>Complete your student profile</strong><small>University, year, major, and graduation</small></div></div>
        <div><span>03</span><div><strong>Enter your workspace</strong><small>Keep your projects and evidence in one place</small></div></div>
      </div>
      <div class="setup-quote">“Great work should outlive graduation.” <span>ITHACA</span></div>
    </section>
    <section class="setup-form-card" aria-labelledby="setup-form-heading">
      <div class="setup-card-heading"><div><p class="dashboard-kicker">${editing ? 'EDIT PROFILE' : 'STEP 2 OF 2'}</p><h2 id="setup-form-heading">Your student information</h2><p>All fields marked required help build your engineering profile.</p></div><span class="setup-card-mark" aria-hidden="true">Ι</span></div>
      <form id="onboarding-form" class="student-form">
        <div class="student-field"><label for="onboarding-university">University or college <span>Required</span></label>
          <input id="onboarding-university" name="universityName" type="text" list="onboarding-university-list" placeholder="Search for your university" value="${e(university)}" minlength="2" maxlength="160" autocomplete="organization" required>
          <datalist id="onboarding-university-list"></datalist></div>
        <div class="student-fields-two">
          <div class="student-field"><label for="onboarding-classification">Classification <span>Required</span></label><select id="onboarding-classification" name="classification" required><option value="">Select your year</option>${choices}</select></div>
          <div class="student-field"><label for="onboarding-year">Graduation year <span>Required</span></label><input id="onboarding-year" name="graduationYear" type="number" value="${e(graduationYear)}" min="${currentYear}" max="${currentYear + 12}" placeholder="${currentYear + 3}" required></div>
        </div>
        <div class="student-field"><label for="onboarding-major">Major <span>Required</span></label><input id="onboarding-major" name="major" value="${e(major)}" required minlength="2" maxlength="120" placeholder="e.g. Computer Engineering"></div>
        <div class="setup-upload">
          <div><strong>Your resume</strong><span>Optional · PDF or DOCX · 2 MB max</span></div>
          <input id="onboarding-resume" name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Upload your resume">
          <small>${profile.resume ? `Current resume: ${e(profile.resume.filename)}. Choose another file to replace it.` : 'You can upload a resume now or from your dashboard later. It remains private.'}</small>
        </div>
        <div class="student-form-footer">
          ${editing ? '<button type="button" class="student-button-quiet" id="cancel-profile-edit">Cancel</button>' : ''}
          <button type="submit" class="student-button-primary">${editing ? 'Save changes' : 'Complete setup'} <span aria-hidden="true">→</span></button>
        </div>
        <p id="onboarding-status" class="student-feedback" role="status" aria-live="polite"></p>
      </form>
    </section>
  </div>`;
  document.querySelector('#identity-name').textContent = profile.name;
  document.querySelector('#identity-detail').textContent = editing ? 'Editing academic details' : 'Student profile setup';
  bindUniversitySearch();
  document.querySelector('#cancel-profile-edit')?.addEventListener('click', () => studentHome(profile));
  document.querySelector('#onboarding-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector('#onboarding-status');
    const button = form.querySelector('button[type="submit"]');
    const resume = form.querySelector('#onboarding-resume').files[0];
    button.disabled = true;
    feedback.textContent = 'Saving your profile…';
    try {
      const details = Object.fromEntries(new FormData(form));
      delete details.resume;
      if (resume) {
        feedback.textContent = 'Uploading your resume securely…';
        await uploadResume(resume);
      }
      feedback.textContent = 'Saving your university and academic details…';
      await api('/auth/onboarding', { method: 'POST', body: details });
      location.replace('/dashboard#home');
      location.reload();
    } catch (err) {
      feedback.textContent = err.message || 'Unable to save your profile. Please try again.';
      button.disabled = false;
    }
  });
}

function resumeControls(profile) {
  const form = document.querySelector('#resume-update-form');
  document.querySelector('#download-resume')?.addEventListener('click', async () => {
    try { await downloadResume(); }
    catch (error) { document.querySelector('#resume-update-status').textContent = error.message; }
  });
  document.querySelector('#remove-resume')?.addEventListener('click', async () => {
    if (!window.confirm('Delete your stored resume? You can upload another later.')) return;
    const status = document.querySelector('#resume-update-status');
    status.textContent = 'Removing your resume…';
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/auth/resume', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Unable to remove the resume.');
      location.reload();
    } catch (error) { status.textContent = error.message; }
  });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const status = document.querySelector('#resume-update-status');
    button.disabled = true;
    status.textContent = 'Uploading your resume securely…';
    try {
      await uploadResume(document.querySelector('#resume-update').files[0]);
      location.reload();
    } catch (error) {
      status.textContent = error.message || 'Upload failed. Try again.';
      button.disabled = false;
    }
  });
}

function studentHome(profile) {
  configureStudentShell({ label: 'Student dashboard' });
  const university = profile.universityName || 'Not provided';
  const studentClass = studentYear(profile.classification);
  const major = profile.major || 'Not provided';
  const name = firstName(profile.name);
  const resumeName = profile.resume?.filename;
  document.querySelector('#identity-detail').textContent = [studentClass, university].filter(Boolean).join(' · ');
  document.querySelector('#content').innerHTML = `<div class="student-dashboard">
    <section class="student-welcome">
      <div class="welcome-content">
        <span class="welcome-eyebrow">YOUR ITHACA WORKSPACE <span class="welcome-dot"></span> PROFILE ACTIVE</span>
        <h1>Welcome to Ithaca, ${e(name)}.</h1>
        <p>One home for your engineering journey. Build your record, connect with your team, and make your contributions count.</p>
        <div class="welcome-actions"><button id="edit-profile" class="welcome-primary">Edit my profile <span aria-hidden="true">↗</span></button><span class="welcome-lock">Private student workspace</span></div>
      </div>
      <div class="welcome-art" aria-hidden="true"><div class="welcome-ring"><span>Ι</span></div><small>WHERE LEGACIES LIVE ON</small></div>
    </section>
    <div class="dashboard-section-heading"><div><p class="dashboard-kicker">YOUR DETAILS</p><h2>Academic overview</h2></div><span class="dashboard-subtle">Information you control</span></div>
    <div class="academic-grid">
      <article class="academic-tile"><span class="academic-symbol">01</span><p>University</p><strong>${e(university)}</strong></article>
      <article class="academic-tile"><span class="academic-symbol">02</span><p>Classification</p><strong>${e(studentClass)}</strong></article>
      <article class="academic-tile"><span class="academic-symbol">03</span><p>Major</p><strong>${e(major)}</strong></article>
      <article class="academic-tile"><span class="academic-symbol">04</span><p>Graduation</p><strong>Class of ${e(profile.graduationYear || '—')}</strong></article>
    </div>
    <div class="dashboard-columns">
      <section class="student-panel next-panel">
        <div class="student-panel-title"><div><p class="dashboard-kicker">GETTING STARTED</p><h2>Your next chapter</h2></div><span class="panel-step">02 / 03</span></div>
        <ol class="journey-list">
          <li class="journey-done"><span class="journey-icon">✓</span><div><strong>Academic profile completed</strong><p>Your university, major and graduation year are saved.</p></div></li>
          <li class="${resumeName ? 'journey-done' : 'journey-next'}"><span class="journey-icon">${resumeName ? '✓' : '2'}</span><div><strong>${resumeName ? 'Resume saved' : 'Add your resume'}</strong><p>${resumeName ? 'Your file is stored privately in Ithaca.' : 'Optional, but useful to keep your experience together.'}</p></div></li>
          <li class="journey-next"><span class="journey-icon">3</span><div><strong>Connect with an engineering club</strong><p>A club administrator must invite or assign you before project and recruitment features unlock.</p></div></li>
        </ol>
        <div class="member-access"><div><strong>Membership identifier</strong><p>Share this ID with your club administrator when joining.</p></div><button id="copy-member-id" class="student-button-quiet" type="button">Copy ID</button></div>
        <p id="member-copy-status" class="student-feedback" role="status" aria-live="polite"></p>
      </section>
      <section class="student-panel resume-panel">
        <div class="student-panel-title"><div><p class="dashboard-kicker">YOUR DOCUMENTS</p><h2>Resume vault</h2></div><span class="private-tag">PRIVATE</span></div>
        <div class="resume-file-state"><span class="resume-file-icon">PDF</span><div><strong>${resumeName ? e(resumeName) : 'No resume uploaded yet'}</strong><p>${resumeName ? 'Stored securely · only your account can access this file' : 'Upload a PDF or DOCX to keep your resume in your Ithaca profile.'}</p></div></div>
        <form id="resume-update-form" class="resume-vault-form">
          <label for="resume-update">Upload ${resumeName ? 'a new version' : 'your resume'}</label>
          <input id="resume-update" name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>
          <p>PDF or DOCX · 2 MB max · not shared with clubs or recruiters</p>
          <button type="submit" class="student-button-primary">Save resume <span aria-hidden="true">↑</span></button>
        </form>
        ${resumeName ? '<div class="resume-extra-actions"><button id="download-resume" type="button" class="student-button-quiet">Download</button><button id="remove-resume" type="button" class="student-button-quiet">Remove</button></div>' : ''}
        <p id="resume-update-status" class="student-feedback" role="status" aria-live="polite"></p>
      </section>
    </div>
    <section class="dashboard-footnote"><span class="footnote-icon">i</span><p><strong>Your workspace will grow with your work.</strong> Athena, Kleos Ledger, The Court, and Bow unlock when you receive approved club access. Ithaca does not create fictional memberships or contribution data for your account.</p></section>
  </div>`;
  document.querySelector('#edit-profile').addEventListener('click', () => onboarding(profile, {}, true));
  document.querySelector('#copy-member-id').addEventListener('click', async () => {
    const status = document.querySelector('#member-copy-status');
    try {
      await navigator.clipboard.writeText(profile.internalMemberId);
      status.textContent = 'Membership ID copied.';
    } catch {
      status.textContent = 'Your membership ID is ' + profile.internalMemberId;
    }
  });
  resumeControls(profile);
}

try {
  const supabase = await loadSupabase();
  if (!supabase) {
    document.body.classList.add('demo-mode');
    const picker = document.querySelector('.viewing-as-picker');
    if (picker) picker.hidden = false;
    document.querySelector('#workspace-footer-note').textContent = 'Fictional local demo mode';
    await import('./app.js');
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      location.replace(`/login?redirect=${encodeURIComponent(location.href)}`);
    } else {
      const picker = document.querySelector('.viewing-as-picker');
      if (picker) picker.hidden = true;
      document.querySelector('#connection').textContent = 'Secure session';
      const logout = document.querySelector('#logout');
      logout.hidden = false;
      logout.addEventListener('click', async () => { logout.disabled = true; await supabase.auth.signOut(); location.replace('/'); });
      const { data: me } = await api('/auth/me');
      const { profile } = me;
      document.querySelector('#identity-name').textContent = profile.name;
      document.querySelector('#identity-avatar').textContent = profile.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
      document.querySelector('#identity-detail').textContent = [studentYear(profile.classification), profile.universityName].filter(Boolean).join(' · ');
      if (me.onboardingRequired) onboarding(profile, session.user?.user_metadata || {});
      else if (!profile.clubIds?.length) studentHome(profile);
      else await import('./app.js');
    }
  }
} catch (error) {
  document.querySelector('#content').innerHTML = `<div class="notice" role="alert">${e(error.message)}</div><p><a class="button" href="/login">Return to login</a></p>`;
}
