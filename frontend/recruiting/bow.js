import { api } from '../shared/api.js';
import { e } from '../shared/ui.js';

const state = { clubId: '', flash: '' };
export async function renderBow(input = {}) {
  if (input?.clubId) state.clubId = input.clubId;
  if (input?.flash) state.flash = input.flash;
  const [{ data: clubs }, { data: me }] = await Promise.all([api('/clubs'), api('/auth/me')]);
  if (!state.clubId || !clubs.some(c => c.id === state.clubId)) state.clubId = clubs[0]?.id || '';
  const club = clubs.find(c => c.id === state.clubId);
  if (!club) return '<div class="module-empty">Start or join a club before working on leadership succession.</div>';
  const isOfficer = club.officerIds.includes(me.profile.internalMemberId);
  if (!isOfficer) return `<div class="module-page"><header class="module-hero"><div><span class="module-kicker">BOW / LEADERSHIP CONTINUITY</span><h1>Passing the torch is deliberate.</h1><p>Officer succession plans are maintained by your club's current officers. You can ask a club officer to consider you for an open role.</p></div></header><section class="module-panel"><h2>Officer access required</h2><p>Bow uses approved contribution evidence and explicit human nominations. No member is promoted automatically.</p></section></div>`;
  const { data: succession } = await api(`/organizations/${encodeURIComponent(club.id)}/succession`);
  const roles = succession.roles || [];
  const roleCards = roles.map(role => `<article class="bow-role-card">
    <div class="bow-role-header"><span class="module-panel-kicker">SUCCESSION ROLE</span><span class="module-chip">${role.nominations?.length || 0} nominations</span></div><h3>${e(role.title)}</h3><p>${e(role.description)}</p>
    <div class="bow-skill-tags">${role.skills.length ? role.skills.map(s => `<span>${e(s)}</span>`).join('') : '<span>No skill criteria set</span>'}</div>
    <div class="bow-candidates-heading"><strong>Evidence-based candidate shortlist</strong><small>Based on recorded, officer-approved work — not a prediction of leadership.</small></div>
    <div class="bow-candidates">${role.candidates.length ? role.candidates.map(candidate => `<div class="bow-candidate">
      <span class="module-avatar">${e(candidate.name.split(' ').map(w=>w[0]).slice(0,2).join(''))}</span><div class="bow-candidate-person"><strong>${e(candidate.name)}</strong><small>${candidate.contributions} approved contributions · ${candidate.points} points · ${candidate.matchingSkills.length} matching skills</small></div>
      ${role.nominations?.some(n => n.memberId === candidate.memberId) ? '<span class="bow-nominated">Proposed</span>' :
        `<button type="button" data-bow-nominate="${e(role.id)}" data-member-id="${e(candidate.memberId)}">Nominate</button>`}
    </div>`).join('') : '<p class="module-empty">No members in this club yet. Invite your teammates to begin.</p>'}</div>
    <p class="bow-human-review">A nomination records a proposed successor; it does not grant officer privileges.</p>
  </article>`).join('') || '<div class="module-empty-state"><h3>No succession plans created yet</h3><p>Define an officer role and the team will build an evidence-based shortlist from approved contributions.</p></div>';
  const flash = state.flash ? `<div class="notice" role="status">${e(state.flash)}</div>` : ''; state.flash = '';
  return `<div class="module-page module-bow">
    <header class="module-hero bow-hero"><div><span class="module-kicker">BOW / OFFICER SUCCESSION</span><h1>Make the handoff count.</h1><p>Preserve the next generation of club leadership. Define roles, review verified work, and document successor nominations before the team changes hands.</p></div><div class="module-hero-symbol" aria-hidden="true">↗</div></header>
    <div class="module-heading"><div><span>LEADERSHIP CONTINUITY</span><h2>Succession planning</h2></div><p>Officer-controlled · No automated appointment</p></div>
    ${flash}
    <div class="module-two-col">
      <section class="module-panel bow-create-panel"><div class="module-panel-head"><div><span>BUILD YOUR HANDOFF PLAN</span><h2>Define an officer role</h2></div></div>
        <form id="bow-role-form" class="module-form">
          <label for="bow-title">Position title</label><input id="bow-title" name="title" placeholder="e.g. Firmware Lead" required minlength="3" maxlength="100">
          <label for="bow-description">Responsibilities & handoff expectations</label><textarea id="bow-description" name="description" rows="4" maxlength="800" minlength="10" placeholder="Own firmware releases, board bring-up and onboarding of the next team" required></textarea>
          <label for="bow-skills">Skills to look for <small>(comma-separated)</small></label><input id="bow-skills" name="skills" placeholder="C++, CAN, STM32, Testing">
          <button type="submit">Create succession role <span aria-hidden="true">↗</span></button>
          <p id="bow-form-status" role="status"></p>
        </form>
      </section>
      <section class="module-panel bow-overview"><div class="module-panel-head"><div><span>YOUR ORGANIZATION</span><h2>${e(club.name)}</h2></div><span class="module-chip">Officer</span></div>
        <div class="bow-overview-stats"><div><strong>${roles.length}</strong><small>Roles planned</small></div><div><strong>${roles.reduce((sum, r) => sum + (r.nominations?.length || 0), 0)}</strong><small>Proposed successors</small></div></div>
        <p>Bow evaluates recorded skills and contribution counts only. Interviews, mentoring ability, and actual leadership choices remain the responsibility of your club's officers.</p>
        <a href="#kleos" class="module-text-link">Review the club's evidence in Kleos →</a>
      </section>
    </div>
    <div class="module-heading"><div><span>OPEN HANDOFF PLANS</span><h2>Officer roles & candidate evidence</h2></div><p>${roles.length} ${roles.length === 1 ? 'role' : 'roles'}</p></div>
    <div class="bow-role-grid">${roleCards}</div>
    <p class="module-disclaimer">${e(succession.caveat)}</p>
  </div>`;
}
export function bindBow(root, rerender) {
  const form = root.querySelector('#bow-role-form');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button');
    const status = root.querySelector('#bow-form-status');
    submit.disabled = true; status.textContent = 'Saving succession plan…';
    try {
      const values = Object.fromEntries(new FormData(form));
      const skills = String(values.skills || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 12);
      await api(`/organizations/${encodeURIComponent(state.clubId)}/succession`, { method: 'POST', body: { title: values.title, description: values.description, skills } });
      rerender({ flash: 'Succession role created. Review candidate evidence before making nominations.' });
    } catch (error) { status.textContent = error.message; submit.disabled = false; }
  });
  root.querySelectorAll('[data-bow-nominate]').forEach(button => button.addEventListener('click', async () => {
    const roleId = button.dataset.bowNominate, memberId = button.dataset.memberId;
    if (!window.confirm('Propose this member as a successor? This does not assign an officer role.')) return;
    button.disabled = true;
    try {
      await api(`/organizations/${encodeURIComponent(state.clubId)}/succession/${encodeURIComponent(roleId)}/nominate`, { method: 'POST', body: { memberId } });
      rerender({ flash: 'Candidate nominated. No officer privileges have changed.' });
    } catch (error) { button.textContent = error.message; button.disabled = false; }
  }));
}
