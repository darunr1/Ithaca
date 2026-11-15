import { loadSupabase } from './supabase.js';
import { api } from './shared/api.js';
import { e } from './shared/ui.js';

const request = (path, options = {}) => api(path, { method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
function onboarding(profile, universities) {
  const year = new Date().getFullYear();
  document.querySelector('#content').innerHTML = `<section class="panel onboarding"><p class="eyebrow">WELCOME TO ITHACA</p><h1>Complete your engineering profile.</h1><p class="body-copy">We never infer your university, major, clubs, or role. Choose the information that is true for you. Club membership is granted separately by a club administrator.</p><form id="onboarding-form"><label for="onboarding-university">University</label><select id="onboarding-university" name="universityId" required><option value="">Choose a registered university</option>${universities.map(item => `<option value="${e(item.id)}">${e(item.name)}</option>`).join('')}</select><label for="onboarding-major">Major</label><input id="onboarding-major" name="major" required minlength="2" maxlength="120" placeholder="Mechanical Engineering"><label for="onboarding-year">Graduation year</label><input id="onboarding-year" name="graduationYear" type="number" min="${year}" max="${year + 12}" required><button type="submit">Open my workspace</button><p id="onboarding-status" role="status"></p></form></section>`;
  document.querySelector('#identity-name').textContent = profile.name; document.querySelector('#identity-detail').textContent = 'Onboarding required';
  document.querySelector('#onboarding-form').addEventListener('submit', async event => { event.preventDefault(); const status = document.querySelector('#onboarding-status'); const button = event.target.querySelector('button'); button.disabled = true; status.textContent = 'Saving your profile…'; try { const body = Object.fromEntries(new FormData(event.target)); await request('/auth/onboarding', { method: 'POST', body: JSON.stringify(body) }); location.reload(); } catch (cause) { status.textContent = cause.message; button.disabled = false; } });
}
try {
  const supabase = await loadSupabase();
  if (!supabase) { document.body.classList.add('demo-mode'); document.querySelector('#workspace-footer-note').textContent = 'Fictional local demo mode'; await import('./app.js'); }
  else {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { location.replace(`/login?redirect=${encodeURIComponent(location.href)}`); throw new Error('Redirecting to login.'); }
    const logout = document.querySelector('#logout');
    logout.hidden = false;
    logout.addEventListener('click', async () => { logout.disabled = true; await supabase.auth.signOut(); location.replace('/'); });
    const me = await request('/auth/me'); const { profile } = me.data;
    document.querySelector('#identity-name').textContent = profile.name; document.querySelector('#identity-avatar').textContent = profile.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
    document.querySelector('#identity-detail').textContent = profile.onboarded ? [profile.major, profile.universityId].filter(Boolean).join(' · ') : 'Onboarding required';
    if (me.data.onboardingRequired) onboarding(profile, (await request('/auth/onboarding-options')).data.universities);
    else if (!profile.clubIds.length) document.querySelector('#content').innerHTML = `<section class="panel onboarding"><p class="eyebrow">PROFILE READY</p><h1>Your account is secure.</h1><p class="body-copy">A club administrator must add member ID <code>${e(profile.internalMemberId)}</code> to a club before project documents, ledgers, recruiter tools, or succession records become available. Ithaca never assigns memberships or officer roles automatically.</p></section>`;
    else await import('./app.js');
  }
} catch (cause) { document.querySelector('#content').innerHTML = `<div class="notice" role="alert">${e(cause.message)}</div><p><a class="button" href="/login">Return to login</a></p>`; }
