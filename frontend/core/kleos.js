import { api, currentMemberId } from '../shared/api.js';
import { e, heading, memberLink } from '../shared/ui.js';
const state = { range: 'all', universityId: null, flash: null };
const RANGES = { all: 'All time', semester: 'Semester', week: 'This week' };
const LEVELS = { low: 'Low · 30', medium: 'Medium · 60', high: 'High · 90' };
const today = () => new Date().toLocaleDateString('en-CA');
function rankingPanel(club, rankings) {
  const rows = rankings.rows.map(r => `<tr><td><span class="rank">${r.rank}</span></td><td>${memberLink(r.memberId, r.name)}</td><td>${r.points}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No recorded activity in this period.</td></tr>';
  return `<section class="panel"><div class="section-title"><h2>Club activity</h2><label class="sr-only" for="ranking-range">Ranking period</label><select id="ranking-range">${Object.entries(RANGES).map(([value, label]) => `<option value="${value}" ${state.range === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><p class="body-copy">${e(club.name)} · ${e(rankings.caveat)} Select a member to see their stats.</p><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Member</th><th>Activity points</th></tr></thead><tbody>${rows}</tbody></table></div><div class="mini-note">10 attendance · 30 low · 60 medium · 90 high<br>Custom: 10–100, in steps of 10</div></section>`;
}
function semesterPanel(history) {
  const semesters = history.semesters.map((s, i) => `<details class="semester" ${i === 0 ? 'open' : ''}><summary><span><strong>${e(s.label)}</strong><small>${s.contributors} contributor${s.contributors === 1 ? '' : 's'}</small></span><span class="semester-totals"><b>${s.contributions}</b> contribution${s.contributions === 1 ? '' : 's'} · <b>${s.points}</b> pts</span></summary>
    <div class="bars">${s.members.map(m => `<div class="bar-row">${memberLink(m.memberId, m.name)}<span class="bar"><i style="width:${Math.round(100 * m.contributions / s.members[0].contributions)}%"></i></span><span class="muted">${m.contributions} · ${m.points} pts</span></div>`).join('')}</div>
    <ul class="entry-list">${s.entries.map(c => `<li><span class="muted">${e(c.date)}</span><div><p>${e(c.description)}</p><small>${memberLink(c.memberId, c.name)} · ${e(c.level)} · ${c.points} pts</small></div></li>`).join('')}</ul></details>`).join('') || '<p class="empty">No approved contributions yet.</p>';
  return `<section class="panel"><div class="section-title"><div><p class="eyebrow">OFFICER VIEW</p><h2>Semester by semester</h2></div><span class="pill outline">${e(history.clubName)}</span></div>${history.pendingRequests ? `<a class="text-link" href="#athena">${history.pendingRequests} member request${history.pendingRequests === 1 ? '' : 's'} awaiting review <span>→</span></a>` : '<p class="muted">No member requests awaiting review.</p>'}<div class="semester-list">${semesters}</div></section>`;
}
function requestPanel(club, requests) {
  const flash = state.flash ? `<div class="notice" role="status">${e(state.flash)}</div>` : '';
  state.flash = null;
  const mine = requests.map(r => `<article class="draft"><div class="card-top"><span class="pill">${e(r.status)} · no points yet</span><span class="muted">${e(r.date)}</span></div><h3>${e(r.description)}</h3><p>Suggested: ${e(r.suggestedLevel)}${r.skills.length ? ` · ${r.skills.map(e).join(', ')}` : ''}</p></article>`).join('') || '<p class="empty">You haven’t requested credit yet.</p>';
  return `<section class="panel"><p class="eyebrow">MEMBER REQUEST</p><h2>Request contribution credit</h2><p class="body-copy">Tell your ${e(club.name)} officers what you did. A different officer reviews it; requests earn no points until approved.</p>${flash}
    <form id="contribution-request" class="request-form">
      <label for="req-description">What did you contribute?</label><textarea id="req-description" name="description" required minlength="10" maxlength="2000" rows="3" placeholder="Rewrote the parachute deployment checklist and walked the team through it."></textarea>
      <label for="req-evidence">Evidence an officer can verify</label><textarea id="req-evidence" name="evidence" required maxlength="2000" rows="2" placeholder="Quote the meeting notes, or name the PR, doc, or test log."></textarea>
      <div class="form-row"><div><label for="req-date">Date</label><input id="req-date" name="date" type="date" required max="${today()}" value="${today()}"></div><div><label for="req-level">Suggested level</label><select id="req-level" name="suggestedLevel">${Object.entries(LEVELS).map(([v, l]) => `<option value="${v}" ${v === 'medium' ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <label for="req-skills">Skills <span class="muted">(comma separated, optional)</span></label><input id="req-skills" name="skills" maxlength="400" placeholder="Recovery systems, Documentation">
      <p id="request-status" class="form-error" role="alert"></p>
      <button type="submit">Submit for officer review</button>
    </form><hr><h3>Your requests</h3>${mine}</section>`;
}
function universityPanels(totals, board) {
  const options = totals.map(u => `<option value="${e(u.universityId)}" ${u.universityId === board.university.id ? 'selected' : ''}>${e(u.name)}</option>`).join('');
  const people = board.rows.map(r => `<tr><td><span class="rank">${r.rank}</span></td><td>${memberLink(r.memberId, r.name)}<small class="sub">${r.clubs.map(e).join(' · ')}</small></td><td>${r.contributions}</td><td>${r.points}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No approved contributions yet.</td></tr>';
  const schools = totals.map(u => `<tr><td><span class="rank">${u.rank}</span></td><td>${e(u.name)}<small class="sub">${u.contributors} contributors · ${u.clubs} club${u.clubs === 1 ? '' : 's'}</small></td><td>${u.contributions}</td><td>${u.points}</td></tr>`).join('');
  return `<div class="columns ledger-universities"><section class="panel"><div class="section-title"><h2>Most contributions</h2><label class="sr-only" for="university-select">University</label><select id="university-select">${options}</select></div><p class="body-copy">Every club at ${e(board.university.name)} · ${e(board.caveat)}</p><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Member</th><th>Contributions</th><th>Points</th></tr></thead><tbody>${people}</tbody></table></div></section>
    <section class="panel"><div class="section-title"><h2>Universities by contributions</h2></div><p class="body-copy">Officer-approved contributions across all clubs.</p><div class="table-wrap"><table><thead><tr><th>Rank</th><th>University</th><th>Contributions</th><th>Points</th></tr></thead><tbody>${schools}</tbody></table></div></section></div>`;
}
export async function renderKleos(argument) {
  if (typeof argument === 'string') state.range = argument;
  else if (argument && typeof argument === 'object') Object.assign(state, argument);
  const [{ data: profile }, { data: clubs }, { data: totals }] = await Promise.all([api(`/members/${encodeURIComponent(currentMemberId())}`), api('/clubs'), api('/universities')]);
  const me = profile.member;
  const club = clubs.find(c => c.id === me.clubIds[0]) || clubs[0];
  const officer = club.officerIds.includes(me.id);
  const universityId = state.universityId || me.universityId;
  const [{ data: rankings }, { data: board }, side] = await Promise.all([
    api(`/clubs/${club.id}/rankings?range=${state.range}`),
    api(`/universities/${encodeURIComponent(universityId)}/leaderboard`),
    officer ? api(`/clubs/${club.id}/semesters`) : api(`/clubs/${club.id}/contribution-requests`)
  ]);
  return `${heading('KLEOS / REPUTATION THROUGH DEEDS', 'The record behind the recognition.', 'Approved work, original evidence, and the people who made it happen.')}
    <p class="viewing-as">Viewing as ${memberLink(me.id, me.name)} · ${officer ? 'Officer' : 'Member'} of ${e(club.name)} <span class="muted">(demo identity, not a sign-in)</span></p>
    <div class="columns">${rankingPanel(club, rankings)}${officer ? semesterPanel(side.data) : requestPanel(club, side.data)}</div>
    ${universityPanels(totals, board)}`;
}
export function bindKleos(root, rerender) {
  root.querySelector('#ranking-range')?.addEventListener('change', event => rerender({ range: event.target.value }));
  root.querySelector('#university-select')?.addEventListener('change', event => rerender({ universityId: event.target.value }));
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
