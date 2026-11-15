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


function configureStudentShell({ locked = true, label = 'My workspace', showNavigation = false } = {}) {
  document.body.classList.add('student-workspace');
  document.querySelector('#breadcrumb').textContent = label;
  
  const picker = document.querySelector('.viewing-as-picker');
  if (picker) picker.hidden = true;
  document.querySelector('.student-top-brand').hidden = false;
  document.querySelector('.student-top-nav').hidden = !showNavigation;
  document.querySelector('.student-top-account').hidden = false;
  const displayName = document.querySelector('#identity-name').textContent;
  document.querySelector('#student-top-name').textContent = displayName;
  document.querySelector('#student-top-avatar').textContent = displayName.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase() || 'Ι';
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
  configureStudentShell({ label: editing ? 'Edit academic profile' : 'Complete your profile', showNavigation: editing });
  if (editing) bindStudentNavigation(profile, 'profile');
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


function bindStudentNavigation(profile, active = 'overview') {
  document.querySelectorAll('[data-student-view]').forEach(button => {
    const view = button.dataset.studentView;
    if (view === active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    button.onclick = () => {
      if (view === 'profile') return onboarding(profile, {}, true);
      studentHome(profile);
      if (view === 'resume') document.querySelector('#studio-resume')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
}

function studentHome(profile) {
  configureStudentShell({ label: 'Overview', showNavigation: true });
  bindStudentNavigation(profile, 'overview');
  const name = firstName(profile.name);
  const university = profile.universityName || 'University not provided';
  const major = profile.major || 'Major not provided';
  const classification = studentYear(profile.classification);
  const resumeName = profile.resume?.filename || '';
  document.querySelector('#identity-detail').textContent = [classification, university].join(' · ');
  document.title = 'Your workspace · Ithaca';
  document.querySelector('#content').innerHTML = `<div class="studio-dashboard">
    <div class="studio-intro">
      <div><span class="studio-eyebrow"><span class="studio-eyebrow-line"></span> PERSONAL WORKSPACE / OVERVIEW</span>
        <h1>Make work that lasts<span class="studio-accent">.</span></h1>
        <p>Welcome back, <strong>${e(name)}</strong>. Your engineering journey starts here.</p></div>
      <button type="button" id="edit-profile" class="studio-edit"><span aria-hidden="true">✎</span> Edit student details</button>
    </div>
    <section class="studio-spotlight" aria-label="Your engineering identity">
      <div class="studio-spotlight-copy">
        <p class="studio-spotlight-kicker">YOUR ENGINEERING RECORD</p>
        <h2>Every contribution<br>has a story.</h2>
        <p>Your work, your team, and the evidence behind it — all in one place. Start with your student profile and build from there.</p>
        <div class="studio-spotlight-bottom"><span>ITHACA / CHAPTER 01</span><span class="studio-spotlight-dash"></span><span>BEGIN YOUR LEGACY</span></div>
      </div>
      <div class="studio-id-card">
        <div class="studio-card-top"><span><i aria-hidden="true">Ι</i> ITHACA</span><small>STUDENT RECORD</small></div>
        <div class="studio-card-person"><small>PROFILE OF</small><strong>${e(profile.name)}</strong><span>${e(major)}</span></div>
        <div class="studio-card-bottom"><div><small>UNIVERSITY</small><strong>${e(university)}</strong></div><div><small>CLASS OF</small><strong>${e(profile.graduationYear || '—')}</strong></div></div>
      </div>
    </section>

    <div class="studio-section-label"><span>01 / AT A GLANCE</span><h2>Your academic identity</h2><p>Built from the details you provided.</p></div>
    <section class="studio-facts" aria-label="Student academic profile">
      <article><span class="studio-fact-icon" aria-hidden="true">⌂</span><span class="studio-fact-label">University</span><strong>${e(university)}</strong></article>
      <article><span class="studio-fact-icon" aria-hidden="true">◫</span><span class="studio-fact-label">Classification</span><strong>${e(classification)}</strong></article>
      <article><span class="studio-fact-icon" aria-hidden="true">◇</span><span class="studio-fact-label">Major</span><strong>${e(major)}</strong></article>
      <article><span class="studio-fact-icon" aria-hidden="true">↗</span><span class="studio-fact-label">Graduation year</span><strong>${e(profile.graduationYear || '—')}</strong></article>
    </section>

    <div class="studio-section-label"><span>02 / BUILD YOUR RECORD</span><h2>Set yourself up for what's next</h2></div>
    <div class="studio-main-grid">
      <section class="studio-journey" aria-labelledby="studio-journey-title">
        <div class="studio-panel-top"><div><span class="studio-panel-kicker">YOUR JOURNEY</span><h3 id="studio-journey-title">The road ahead</h3></div><span class="studio-progress">${resumeName ? '2 OF 3' : '1 OF 3'} STEPS</span></div>
        <ol class="studio-steps">
          <li class="done"><span class="studio-step-count">✓</span><div><strong>Build your student profile</strong><p>University, classification, major, and graduation year saved.</p></div><span class="studio-step-state">COMPLETE</span></li>
          <li class="${resumeName ? 'done' : 'current'}"><span class="studio-step-count">${resumeName ? '✓' : '02'}</span><div><strong>Keep your resume on hand</strong><p>${resumeName ? 'Your latest resume is saved in your private vault.' : 'Add a PDF or DOCX whenever you are ready.'}</p></div><span class="studio-step-state">${resumeName ? 'COMPLETE' : 'OPTIONAL'}</span></li>
          <li><span class="studio-step-count">03</span><div><strong>Join an engineering organization</strong><p>Your club administrator can grant access to projects, contributions, and recruiting tools.</p></div><span class="studio-step-state">PENDING</span></li>
        </ol>
        <div class="studio-member">
          <div><span class="studio-panel-kicker">YOUR MEMBERSHIP ID</span><code id="studio-member-id">${e(profile.internalMemberId)}</code><small>Share this with a club administrator to request access.</small></div>
          <button id="copy-member-id" type="button">Copy ID <span aria-hidden="true">↗</span></button>
        </div>
        <p id="member-copy-status" class="studio-status" role="status" aria-live="polite"></p>
      </section>

      <section class="studio-document-panel" id="studio-resume" aria-labelledby="studio-resume-title">
        <div class="studio-panel-top"><div><span class="studio-panel-kicker">PERSONAL DOCUMENTS</span><h3 id="studio-resume-title">Resume studio</h3></div><span class="studio-private">PRIVATE</span></div>
        <div class="studio-resume-preview"><div class="studio-file-emblem"><span>${resumeName && resumeName.toLowerCase().endsWith('.docx') ? 'DOC' : 'PDF'}</span></div><div><strong>${resumeName ? e(resumeName) : 'Your next opportunity starts here'}</strong><p>${resumeName ? 'Your file is securely stored and only accessible by you.' : 'Keep your most up-to-date resume in one secure place.'}</p></div></div>
        <form id="resume-update-form" class="studio-upload-form">
          <label for="resume-update">Choose ${resumeName ? 'a new version' : 'your resume'}</label>
          <input id="resume-update" name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>
          <small>PDF or DOCX · 2 MB max · Never publicly shared</small>
          <button type="submit" class="studio-upload-button">${resumeName ? 'Replace resume' : 'Upload resume'} <span aria-hidden="true">↑</span></button>
        </form>
        ${resumeName ? '<div class="studio-file-actions"><button id="download-resume" type="button">Download</button><button id="remove-resume" type="button">Remove file</button></div>' : ''}
        <p id="resume-update-status" class="studio-status" role="status" aria-live="polite"></p>
      </section>
    </div>
    <div class="studio-access-note"><span aria-hidden="true">✳</span><p><strong>What's next?</strong> Athena, Kleos Ledger, The Court, and Bow become available after your club administrator grants you membership. Your account won't be filled with fictional projects or contribution data.</p></div>
  </div>`;
  document.querySelector('#edit-profile').addEventListener('click', () => onboarding(profile, {}, true));
  document.querySelector('#copy-member-id').addEventListener('click', async () => {
    const status = document.querySelector('#member-copy-status');
    try {
      await navigator.clipboard.writeText(profile.internalMemberId);
      status.textContent = 'Member ID copied to clipboard.';
    } catch {
      status.textContent = `Member ID: ${profile.internalMemberId}`;
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
