import { api } from '../shared/api.js';
import { e } from '../shared/ui.js';
import { sampleHomePage } from '../shared/sample-pages.js';

export async function renderHome() {
  const [{ data: clubs }, { data: me }] = await Promise.all([api('/clubs'), api('/auth/me')]);
  if (!clubs.length) return sampleHomePage();
  const active = clubs[0];
  const { data: rankings } = await api(`/clubs/${encodeURIComponent(active.id)}/rankings?range=all`);
  let stats;
  if (me.profile) {
    stats = (await api(`/organizations/${encodeURIComponent(active.id)}/roster-stats`)).data;
  } else {
    const { data: members } = await api(`/clubs/${encodeURIComponent(active.id)}/roster`);
    stats = { members: members.map(m => ({ ...m, officer: active.officerIds.includes(m.id),
      contributions: 0, points: rankings.rows.find(r => r.memberId === m.id)?.points || 0 })) };
  }
  const isOfficer = me.profile ? active.officerIds.includes(me.profile.internalMemberId) : false;
  let received = [], sent = [], invitationError = '';
  if (me.profile) {
    try {
      const response = await api('/organizations/invitations');
      received = response.data || [];
      if (isOfficer) {
        const pending = await api(`/organizations/${encodeURIComponent(active.id)}/invitations`);
        sent = pending.data.invitations || [];
      }
    } catch (error) { invitationError = error.message || 'Invitations could not load.'; }
  }
  const receivedHtml = received.map(invite => `<div class="module-invitation-row" data-athena-invitation="${e(invite.id)}"><div><strong>${e(invite.clubName)}</strong><small>Invited to join this club</small></div><div class="module-invitation-actions"><button type="button" data-invite-action="accept">Accept</button><button type="button" class="module-invite-decline" data-invite-action="decline">Decline</button></div></div>`).join('');
  const sentHtml = sent.map(invite => `<div class="module-invitation-row"><div><strong>${e(invite.name)}</strong><small>${e(invite.invitedMemberId)}</small></div><span class="module-invite-pill">Pending</span></div>`).join('');
  const invitationPanel = me.profile ? `<section class="module-panel module-member-id"><div><span class="module-panel-kicker">YOUR MEMBER ID</span><strong>${e(me.profile.internalMemberId)}</strong><p>Share this ID with another club officer to receive an invitation.</p></div><button type="button" id="copy-club-member-id">Copy member ID</button><span id="copy-club-member-status" role="status"></span></section>${received.length || invitationError ? `<section class="module-panel module-inbox"><div class="module-panel-head"><div><span>MEMBERSHIP</span><h2>Pending invitations</h2></div></div>${receivedHtml || `<p class="module-muted">${e(invitationError)}</p>`}</section>` : ''}` : '';
  const total = stats.members.reduce((sum, m) => sum + m.points, 0);
  const count = stats.members.reduce((sum, m) => sum + m.contributions, 0);
  const rows = stats.members.slice(0, 6).map((m, i) => `<div class="module-person-row"><span class="module-rank">${i+1}</span><span class="module-avatar">${e(m.name.split(' ').map(w=>w[0]).slice(0,2).join(''))}</span><div><strong>${e(m.name)}</strong><small>${e(m.major || 'Engineering member')}${m.officer ? ' · Officer' : ''}</small></div><span class="module-score">${m.points} pts</span></div>`).join('') || '<p class="module-empty">The member roster is currently empty.</p>';
  return `<div class="module-page module-home">
    <header class="module-hero"><div><span class="module-kicker">YOUR ENGINEERING ORGANIZATION</span><h1>${e(active.name)}</h1><p>${e(active.project || 'Your team’s contributions and engineering evidence live here.')}</p><span class="module-chip">${isOfficer ? 'Officer workspace' : 'Member workspace'} · Student-managed</span></div><img class="module-hero-symbol module-hero-logo" src="/assets/ithaca-mark.png" alt="" aria-hidden="true"></header>
    <div class="module-heading"><div><span>OVERVIEW / REAL ACTIVITY</span><h2>Team at a glance</h2></div><p>Everything below comes from your real Atlas records.</p></div>
    <div class="module-metrics"><article><span>Club members</span><strong>${stats.members.length}</strong><small>Current roster</small></article><article><span>Approved contributions</span><strong>${count}</strong><small>Recorded, officer-approved</small></article><article><span>Activity points</span><strong>${total}</strong><small>Contributions and attendance</small></article><article><span>Ranked members</span><strong>${rankings.rows.length}</strong><small>Members with activity</small></article></div>
    ${invitationPanel}
    ${count === 0 && total === 0 ? '<section class="module-panel"><div class="module-panel-head"><div><span>NEW WORKSPACE</span><h2>Explore a populated example</h2></div><span class="module-sample-label">DEMO DATA</span></div><p>Your club has no approved activity yet. The fictional Ledger, Court and Bow previews show how the product works without creating fake records in your club.</p><a href="#kleos" class="module-text-link">Explore the sample roster and contributions →</a></section>' : ''}
    <div class="module-two-col">
      <section class="module-panel"><div class="module-panel-head"><div><span>PEOPLE</span><h2>Your team</h2></div><a href="#kleos">Open ledger →</a></div>${rows}</section>
      <section class="module-panel"><div class="module-panel-head"><div><span>WORKSPACE TOOLS</span><h2>Continue your work</h2></div></div>
        <div class="module-link-grid"><a href="#athena"><strong>Athena</strong><small>Ask Gemini about project documents with citations</small><span>↗</span></a><a href="#kleos"><strong>Kleos Ledger</strong><small>Member records, scores and contribution reviews</small><span>↗</span></a><a href="#court"><strong>The Court</strong><small>Club and university rankings</small><span>↗</span></a><a href="#bow"><strong>Bow</strong><small>Succession planning for club officers</small><span>↗</span></a></div>
      </section>
    </div>
    ${isOfficer ? `<section class="module-panel module-invites"><div class="module-panel-head"><div><span>CLUB ADMINISTRATION</span><h2>Invite a new member</h2></div></div><p>Invite a student from your university who has completed their Ithaca profile. Ask them to copy their member ID.</p><form id="invite-member-form" class="module-inline-form"><label for="invite-member-id" class="sr-only">Student member ID</label><input id="invite-member-id" name="memberId" placeholder="Paste the student's member ID" minlength="8" required><button type="submit">Send invitation</button></form><p id="invite-member-status" role="status"></p><div class="module-sent-invites"><h3>Awaiting response (${sent.length})</h3>${sentHtml || '<p class="module-muted">No pending invitations.</p>'}</div></section>` : ''}
    <p class="module-disclaimer">Student-managed workspace. Rankings reflect recorded activity, not engineering ability. No demo people or invented contributions.</p>
  </div>`;
}
export function bindHome(root) {
  root.querySelector('#copy-club-member-id')?.addEventListener('click', async () => {
    const status = root.querySelector('#copy-club-member-status');
    const value = root.querySelector('.module-member-id strong')?.textContent;
    if (!value) return;
    try { await navigator.clipboard.writeText(value); status.textContent = 'Copied!'; }
    catch { status.textContent = `Your ID: ${value}`; }
  });
  root.querySelectorAll('[data-athena-invitation] [data-invite-action]').forEach(button => button.addEventListener('click', async () => {
    const inviteId = button.closest('[data-athena-invitation]')?.dataset.athenaInvitation;
    const action = button.dataset.inviteAction;
    const row = button.closest('[data-athena-invitation]');
    row.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      await api(`/organizations/invitations/${encodeURIComponent(inviteId)}/respond`, { method: 'POST', body: { action } });
      location.reload();
    } catch (error) {
      const status = document.createElement('small');
      status.setAttribute('role', 'alert'); status.textContent = error.message;
      row.append(status);
      row.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  }));
  const form = root.querySelector('#invite-member-form');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const status = root.querySelector('#invite-member-status');
    button.disabled = true;
    status.textContent = 'Sending invitation…';
    try {
      const clubs = (await api('/clubs')).data;
      await api(`/organizations/${encodeURIComponent(clubs[0].id)}/invitations`, { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      status.textContent = 'Invitation sent. The student must accept it from their dashboard.';
      form.reset();
    } catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
  });
}
