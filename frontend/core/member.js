import { api } from '../shared/api.js';
import { e, initials, sourceCard } from '../shared/ui.js';
const pad = n => String(n).padStart(2, '0');
export async function renderMember(memberId = '') {
  const { data } = await api(`/members/${encodeURIComponent(memberId)}`);
  const { member, contributions, stats } = data;
  const primary = stats.clubs[0];
  const clubLine = stats.clubs.map(c => `${e(c.name)}${c.officer ? ' · Officer' : ''}`).join(' · ');
  const semesters = stats.semesters.map(s => `<tr><td>${e(s.label)}</td><td>${s.contributions}</td><td>${s.attendance}</td><td>${s.points}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No recorded activity yet.</td></tr>';
  const skills = stats.skills.map(s => `<span>${e(s.skill)} × ${s.count}</span>`).join('') || '<p class="empty">No skills documented by approved work yet.</p>';
  return `<div class="page-heading"><div><a class="text-link back-link" href="#kleos">← Kleos Ledger</a><p class="eyebrow">MEMBER RECORD</p><h1>${e(member.name)}</h1><p>${e(member.major)} · Year ${e(member.year)} · ${e(stats.universityName || '')}<br>${clubLine}</p></div><span class="avatar large">${e(initials(member.name))}</span></div>
    <section class="stats" aria-label="${e(member.name)} statistics">
      <article><span>Activity points</span><strong>${stats.totalPoints}</strong><small>${stats.contributionPoints} contribution + ${stats.attendancePoints} attendance</small></article>
      <article><span>Approved contributions</span><strong>${pad(stats.contributionCount)}</strong><small>Officer-reviewed, with evidence</small></article>
      <article><span>Sessions attended</span><strong>${pad(stats.attendanceCount)}</strong><small>10 points each</small></article>
      <article><span>Club rank</span><strong>${primary?.rank ? `#${primary.rank}` : '—'}</strong><small>${primary ? `of ${primary.of} · ${e(primary.name)} · all time` : 'No club activity'}</small></article>
    </section>
    <div class="columns"><section class="panel"><div class="section-title"><h2>Contribution history</h2><span class="muted">${contributions.length} approved</span></div>${contributions.map(sourceCard).join('') || '<p class="empty">No approved contributions yet.</p>'}</section>
      <div class="stack"><section class="panel"><div class="section-title"><h2>By semester</h2></div><div class="table-wrap"><table><thead><tr><th>Semester</th><th>Contributions</th><th>Sessions</th><th>Points</th></tr></thead><tbody>${semesters}</tbody></table></div></section>
      <section class="panel"><div class="section-title"><h2>Demonstrated skills</h2></div><div class="tags">${skills}</div><div class="mini-note">Counted from approved contributions only; self-listed skills are not included.</div></section></div></div>`;
}
