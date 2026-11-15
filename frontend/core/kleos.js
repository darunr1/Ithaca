import { api, currentMemberId } from '../shared/api.js';
import { e, heading, memberLink } from '../shared/ui.js';
const state = { range: 'all', flash: null, openRequests: false };
const RANGES = { all: 'All time', week: 'This week' };
const LEVELS = { low: 'Low · 30', medium: 'Medium · 60', high: 'High · 90' };
const LEVEL_POINTS = { low: 30, medium: 60, high: 90 };
const today = () => new Date().toLocaleDateString('en-CA');
const takeFlash = () => { const flash = state.flash ? `<div class="notice" role="status">${e(state.flash)}</div>` : ''; state.flash = null; return flash; };
function rankingPanel(club, rankings) {
  const rows = rankings.rows.map(r => `<tr><td><span class="rank">${r.rank}</span></td><td>${memberLink(r.memberId, r.name)}</td><td>${r.points}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No recorded activity in this period.</td></tr>';
  return `<section class="panel"><div class="section-title"><h2>Club activity</h2><label class="sr-only" for="ranking-range">Ranking period</label><select id="ranking-range">${Object.entries(RANGES).map(([value, label]) => `<option value="${value}" ${state.range === value ? 'selected' : ''}>${label}</option>`).join('')}<optgroup label="Semester">${rankings.terms.map(t => `<option value="${e(t.id)}" ${state.range === t.id ? 'selected' : ''}>${e(t.label)}</option>`).join('')}</optgroup></select></div><p class="body-copy">${e(club.name)} · ${e(rankings.caveat)} Select a member to see their stats.</p><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Member</th><th>Activity points</th></tr></thead><tbody>${rows}</tbody></table></div><div class="mini-note">10 attendance · 30 low · 60 medium · 90 high<br>Custom: 10–100, in steps of 10</div></section>`;
}
const entryActions = (c, meId) => c.memberId === meId ? '' : `<button type="button" class="entry-reject" data-reject-contribution="${e(c.id)}" data-who="${e(c.name)}" data-points="${c.points}" aria-label="Reject ${e(c.name)}'s contribution">Reject</button>`;
function semesterPanel(history, meId) {
  const semesters = history.semesters.map((s, i) => `<details class="semester" ${i === 0 ? 'open' : ''}><summary><span><strong>${e(s.label)}</strong><small>${s.contributors} contributor${s.contributors === 1 ? '' : 's'}</small></span><span class="semester-totals"><b>${s.contributions}</b> contribution${s.contributions === 1 ? '' : 's'} · <b>${s.points}</b> pts</span></summary>
    <div class="bars">${s.members.map(m => `<div class="bar-row">${memberLink(m.memberId, m.name)}<span class="bar"><i style="width:${Math.round(100 * m.contributions / s.members[0].contributions)}%"></i></span><span class="muted">${m.contributions} · ${m.points} pts</span></div>`).join('')}</div>
    <ul class="entry-list">${s.entries.map(c => `<li><span class="muted">${e(c.date)}</span><div><p>${e(c.description)}</p><small>${memberLink(c.memberId, c.name)} · ${e(c.level)} · ${c.points} pts</small></div>${entryActions(c, meId)}</li>`).join('')}</ul></details>`).join('') || '<p class="empty">No approved contributions yet.</p>';
  return `<section class="panel"><div class="section-title"><div><p class="eyebrow">OFFICER VIEW</p><h2>Semester by semester</h2></div><span class="pill outline">${e(history.clubName)}</span></div>${takeFlash()}${pendingRequestsBlock(history.requests)}<div class="semester-list">${semesters}</div></section>`;
}
// Review controls for one request: approve at the suggested level, give custom points, or delete.
function reviewControls(r) {
  const suggested = LEVEL_POINTS[r.suggestedLevel];
  return `<div class="review" data-request="${e(r.id)}">
      <button type="button" data-review="approve" data-level="${e(r.suggestedLevel)}">Approve · ${e(r.suggestedLevel)} (${suggested} pts)</button>
      <div class="custom-points"><label for="custom-${e(r.id)}">Custom points</label><input id="custom-${e(r.id)}" type="number" min="10" max="100" step="10" value="${suggested}" inputmode="numeric"><button type="button" class="secondary" data-review="custom">Give custom points</button></div>
      <button type="button" class="danger" data-review="delete">Delete request</button>
      <p class="form-error review-error" role="alert"></p>
    </div>`;
}
// Pending member requests, opened in place so officers stay on the ledger.
function pendingRequestsBlock(requests = []) {
  if (!requests.length) return '<p class="muted">No member requests awaiting review.</p>';
  const cards = requests.map(r => `<article class="request-card"><div class="card-top"><span>${memberLink(r.memberId, r.name)}</span><span class="muted">${e(r.date)}</span></div><h3>${e(r.description)}</h3><div class="tags"><span>Suggested: ${e(r.suggestedLevel)}</span>${r.skills.map(s => `<span>${e(s)}</span>`).join('')}</div><blockquote>${e(r.evidence)}</blockquote><small class="muted">Member-submitted evidence${r.createdAt ? ` · Submitted ${e(new Date(r.createdAt).toLocaleString())}` : ''}</small>${reviewControls(r)}</article>`).join('');
  return `<details class="pending-requests" id="pending-requests" ${state.openRequests ? 'open' : ''}><summary><span class="pending-dot" aria-hidden="true"></span>${requests.length} member request${requests.length === 1 ? '' : 's'} awaiting review<span class="chevron" aria-hidden="true">▾</span></summary><div class="request-list">${cards}</div></details>`;
}
function requestPanel(club, requests) {
  const status = { pending: 'pending · no points yet', approved: 'approved', rejected: 'deleted by an officer' };
  const label = r => r.status === 'approved' && r.contributionRejected ? 'approved, later rejected by an officer' : status[r.status] || r.status;
  const mine = requests.map(r => `<article class="draft"><div class="card-top"><span class="pill ${r.status === 'approved' && !r.contributionRejected ? 'verified' : ''}">${e(label(r))}</span><span class="muted">${e(r.date)}</span></div><h3>${e(r.description)}</h3><p>Suggested: ${e(r.suggestedLevel)}${r.skills.length ? ` · ${r.skills.map(e).join(', ')}` : ''}</p></article>`).join('') || '<p class="empty">You haven’t requested credit yet.</p>';
  return `<section class="panel"><p class="eyebrow">MEMBER REQUEST</p><h2>Request contribution credit</h2><p class="body-copy">Tell your ${e(club.name)} officers what you did. A different officer reviews it; requests earn no points until approved.</p>${takeFlash()}
    <form id="contribution-request" class="request-form">
      <label for="req-description">What did you contribute?</label><textarea id="req-description" name="description" required minlength="10" maxlength="2000" rows="3" placeholder="Rewrote the parachute deployment checklist and walked the team through it."></textarea>
      <label for="req-evidence">Evidence an officer can verify</label><textarea id="req-evidence" name="evidence" required maxlength="2000" rows="2" placeholder="Quote the meeting notes, or name the PR, doc, or test log."></textarea>
      <div class="form-row"><div><label for="req-date">Date</label><input id="req-date" name="date" type="date" required max="${today()}" value="${today()}"></div><div><label for="req-level">Suggested level</label><select id="req-level" name="suggestedLevel">${Object.entries(LEVELS).map(([v, l]) => `<option value="${v}" ${v === 'medium' ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <label for="req-skills">Skills <span class="muted">(comma separated, optional)</span></label><input id="req-skills" name="skills" maxlength="400" placeholder="Recovery systems, Documentation">
      <p id="request-status" class="form-error" role="alert"></p>
      <button type="submit">Submit for officer review</button>
    </form><hr><h3>Your requests</h3>${mine}</section>`;
}
export async function renderKleos(argument) {
  if (typeof argument === 'string') state.range = argument;
  else if (argument && typeof argument === 'object') Object.assign(state, argument);
  const [{ data: profile }, { data: clubs }] = await Promise.all([api(`/members/${encodeURIComponent(currentMemberId())}`), api('/clubs')]);
  const me = profile.member;
  const club = clubs.find(c => c.id === me.clubIds[0]) || clubs[0];
  const officer = club.officerIds.includes(me.id);
  const [{ data: rankings }, side] = await Promise.all([
    api(`/clubs/${club.id}/rankings?range=${state.range}`),
    officer ? api(`/clubs/${club.id}/semesters`) : api(`/clubs/${club.id}/contribution-requests`)
  ]);
  const html = `${heading('KLEOS / REPUTATION THROUGH DEEDS', 'The record behind the recognition.', 'Approved work, original evidence, and the people who made it happen.')}
    <p class="viewing-as">Viewing as ${memberLink(me.id, me.name)} · ${officer ? 'Officer' : 'Member'} of ${e(club.name)} <span class="muted">(demo identity, not a sign-in)</span></p>
    <div class="columns">${rankingPanel(club, rankings)}${officer ? semesterPanel(side.data, me.id) : requestPanel(club, side.data)}</div>`;
  state.openRequests = false;
  return html;
}
// Small confirm pop-up shown before rejecting. Resolves 'accept', 'reject', or null (closed without choosing).
// `title`, `message` and `acceptLabel` must already be HTML-escaped.
function confirmReject({ title, message, acceptLabel }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'confirm-title');
    dialog.innerHTML = `<button type="button" class="dialog-close" data-choice="" aria-label="Close without changing anything">×</button>
      <h2 id="confirm-title">${title}</h2>
      <p>${message}</p>
      <div class="dialog-actions"><button type="button" class="success" data-choice="accept">${acceptLabel}</button><button type="button" class="danger" data-choice="reject">Yes, reject it</button></div>`;
    let choice = null;
    dialog.addEventListener('click', event => {
      const button = event.target.closest('[data-choice]');
      if (button) { choice = button.dataset.choice || null; dialog.close(); }
      else if (event.target === dialog) dialog.close(); // backdrop click
    });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(choice); });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('[data-choice="accept"]').focus();
  });
}
function bindReviews(root, rerender) {
  root.querySelector('#pending-requests')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-review]');
    if (!button) return;
    const box = button.closest('[data-request]'), error = box.querySelector('.review-error');
    const card = button.closest('.request-card'), who = card.querySelector('.member-link')?.textContent || 'this member';
    let body;
    if (button.dataset.review === 'approve') body = { action: 'approve', level: button.dataset.level };
    else if (button.dataset.review === 'custom') {
      const points = Number(box.querySelector('input[type="number"]').value);
      if (!Number.isInteger(points) || points < 10 || points > 100 || points % 10) { error.textContent = 'Custom points must be 10–100, in steps of 10.'; return; }
      body = { action: 'approve', level: 'custom', customPoints: points };
    } else {
      const level = box.querySelector('[data-review="approve"]').dataset.level;
      const choice = await confirmReject({
        title: `Reject ${e(who)}'s request?`,
        message: `Rejecting awards no points. If you'd rather keep it, accept it at the suggested level: <strong>${e(level)} · ${LEVEL_POINTS[level]} pts</strong>.`,
        acceptLabel: 'No, accept it'
      });
      if (!choice) return;
      body = choice === 'accept' ? { action: 'approve', level } : { action: 'delete' };
    }
    box.querySelectorAll('button').forEach(b => { b.disabled = true; });
    error.textContent = '';
    try {
      const { data } = await api(`/contribution-requests/${encodeURIComponent(box.dataset.request)}/review`, { method: 'POST', body });
      const remaining = root.querySelectorAll('.request-card').length - 1;
      rerender({ openRequests: remaining > 0, flash: data.contribution ? `Approved: ${who} earned ${data.contribution.points} points.` : `Deleted ${who}'s request. No points were awarded.` });
    } catch (err) {
      error.textContent = err.message;
      box.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  });
}
// Reject an already-approved contribution from the semester view.
function bindContributionRejects(root, rerender) {
  root.querySelector('.semester-list')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-reject-contribution]');
    if (!button) return;
    const { rejectContribution: id, who, points } = button.dataset;
    const choice = await confirmReject({
      title: `Reject ${e(who)}'s contribution?`,
      message: `This was already approved. Rejecting removes its <strong>${e(points)} pts</strong> from rankings and stats; the audit log keeps a record.`,
      acceptLabel: 'No, keep it'
    });
    if (choice !== 'reject') return;
    button.disabled = true;
    try {
      const { data } = await api(`/contributions/${encodeURIComponent(id)}/reject`, { method: 'POST', body: {} });
      rerender({ flash: `Rejected ${who}'s contribution. ${data.points} points were removed.` });
    } catch (error) {
      rerender({ flash: `Could not reject: ${error.message}` });
    }
  });
}
export function bindKleos(root, rerender) {
  root.querySelector('#ranking-range')?.addEventListener('change', event => rerender({ range: event.target.value }));
  bindReviews(root, rerender);
  bindContributionRejects(root, rerender);
  const form = root.querySelector('#contribution-request');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const status = form.querySelector('#request-status'), button = form.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(form));
    const body = { description: values.description, evidence: values.evidence, date: values.date, suggestedLevel: values.suggestedLevel, skills: String(values.skills || '').split(',').map(s => s.trim()).filter(Boolean) };
    button.disabled = true; status.textContent = '';
    try {
      const { data: profile } = await api(`/members/${encodeURIComponent(currentMemberId())}`);
      await api(`/clubs/${profile.member.clubIds[0]}/contribution-requests`, { method: 'POST', body });
      rerender({ flash: 'Request submitted. Your officers will see it in their review queue.' });
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  });
}
