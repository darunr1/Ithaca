// Read-only sample surfaces. Never submit any data from these previews to backend APIs.
import { e } from './ui.js';
import { SAMPLE_NOTICE, sampleClubs, sampleUniversities, sampleLedger, sampleCourt } from './sample-preview.js';

const sampleBanner = () => `<section class="module-sample-banner" aria-label="Sample data disclosure"><span class="module-sample-label">DEMO DATA</span><div><strong>Illustrative HackUTA preview</strong><p>${e(SAMPLE_NOTICE)}</p></div><button type="button" data-sample-show-live>View real records</button></section>`;
const selectClub = (id, label = 'Sample club') => `<div class="module-context"><label for="sample-club-picker">${e(label)}</label><select id="sample-club-picker">${sampleClubs.map(club => `<option value="${e(club.id)}" ${club.id === id ? 'selected' : ''}>${e(club.name)}</option>`).join('')}</select><span>Preview only · no database changes</span></div>`;

export function sampleLedgerPage(clubId = 'sample-ithaca') {
  const { club, members, contributions, sessions } = sampleLedger(clubId);
  const points = members.reduce((total, m) => total + m.points, 0);
  const rows = members.map((member, index) => `<tr><td><span class="module-rank">#${index + 1}</span></td><td><strong>${e(member.name)}</strong><small class="module-table-sub">${e(member.major)} ${member.officer ? '· Example officer' : ''}</small></td><td>${member.contributions}</td><td>${member.sessions}</td><td><strong>${member.points}</strong></td></tr>`).join('');
  const ranks = members.map((member, index) => `<tr><td>#${index + 1}</td><td>${e(member.name)}</td><td>${member.points}</td></tr>`).join('');
  const history = contributions.map(record => `<article class="sample-contribution-card"><div><strong>${e(record.name)}</strong><small>${e(record.date)} · ${e(record.level)} · ${record.points} sample points</small></div><p>${e(record.description)}</p><span class="module-sample-label">Illustrative, not verified</span></article>`).join('');
  return `<div class="module-page module-ledger module-sample-page">
    <header class="module-hero"><div><span class="module-kicker">KLEOS LEDGER / INTERACTIVE DEMO</span><h1>Proof over promises.</h1><p>Explore a fully populated example of club contributions, sessions and activity scoring. All people and achievements in this preview are illustrative.</p></div><div class="module-hero-symbol" aria-hidden="true">▤</div></header>
    ${sampleBanner()}${selectClub(club.id)}
    <div class="module-heading"><div><span>FICTIONAL DEMONSTRATION</span><h2>${e(club.name)} · Member records</h2></div><p>${members.length} sample members · ${contributions.length} example contributions · ${sessions.length} sessions</p></div>
    <div class="module-metrics"><article><span>Sample members</span><strong>${members.length}</strong><small>Read-only roster</small></article><article><span>Sample contributions</span><strong>${contributions.length}</strong><small>Illustrative evidence</small></article><article><span>Sample activity points</span><strong>${points}</strong><small>Computed from fixture events</small></article><article><span>Sample sessions</span><strong>${sessions.length}</strong><small>Illustrative meetings</small></article></div>
    <section class="module-panel"><div class="module-panel-head"><div><span>READ-ONLY SAMPLE ROSTER</span><h2>Club members</h2></div><span class="module-sample-label">Demo</span></div><div class="table-wrap"><table class="module-roster-table"><thead><tr><th>#</th><th>Member</th><th>Contributions</th><th>Sessions</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <div class="module-two-col">
      <section class="module-panel"><div class="module-panel-head"><div><span>SAMPLE ACTIVITY</span><h2>Club leaderboard</h2></div></div><div class="table-wrap"><table class="module-roster-table"><thead><tr><th>Rank</th><th>Member</th><th>Points</th></tr></thead><tbody>${ranks}</tbody></table></div></section>
      <section class="module-panel"><div class="module-panel-head"><div><span>SAMPLE EVIDENCE</span><h2>Contribution history</h2></div></div><div class="sample-contribution-history">${history}</div></section>
    </div>
    <p class="module-disclaimer">Example data stays in the browser. It does not affect your actual MongoDB contributions, university rankings, recruiter visibility or student records.</p>
  </div>`;
}

export function sampleCourtPage({ mode = 'clubs', clubId = 'sample-ithaca', universityId = 'sample-utd' } = {}) {
  const { club, university, rows, universities } = sampleCourt(mode, clubId, universityId);
  const metric = mode === 'clubs' ? 'points' : 'contributions';
  const title = mode === 'clubs' ? club.name : mode === 'university' ? university.name : 'Across sample universities';
  const rankRows = rows.map((member, index) => `<article class="court-ranking-row ${index < 3 ? 'court-top-three' : ''}"><div class="court-place">#${member.rank}</div><div class="court-ranking-person"><strong>${e(member.name)}</strong><small>${e(member.major)} · Sample record</small></div><div class="court-ranking-score"><strong>${member[metric]}</strong><small>${metric === 'points' ? 'Sample activity points' : 'Sample contributions'}</small></div></article>`).join('');
  const tabs = [['clubs', 'Sample club'], ['university', 'Sample university'], ['global', 'All sample universities']].map(([value, label]) => `<button type="button" data-court-mode="${value}" ${mode === value ? 'aria-pressed="true"' : ''}>${label}</button>`).join('');
  return `<div class="module-page module-court module-sample-page">
    <header class="module-hero court-hero"><div><span class="module-kicker">THE COURT / INTERACTIVE DEMO</span><h1>Where the work speaks.</h1><p>Explore how rankings would change as student clubs submit documented activities. These standings are examples, not real rankings.</p></div><div class="module-hero-symbol" aria-hidden="true">◎</div></header>
    ${sampleBanner()}
    <div class="module-heading"><div><span>FICTIONAL DEMONSTRATION</span><h2>Sample rankings and recognition</h2></div><p>Calculated from sample contributions and session attendance</p></div>
    <div class="court-tabs" role="group" aria-label="Example ranking scope">${tabs}</div>
    <div class="court-ranking-shell"><div class="court-ranking-header"><div><span class="module-panel-kicker">SAMPLE / ${e(mode.toUpperCase())} LEADERBOARD</span><h2>${e(title)}</h2><p>${rows.length} sample contributors · ${metric === 'points' ? 'Example contribution and attendance points' : 'Example contribution totals'}</p></div>
    <div class="court-filters">${mode === 'clubs' ? `<label for="court-club">Club</label><select id="court-club">${sampleClubs.map(c => `<option value="${e(c.id)}" ${c.id === club.id ? 'selected' : ''}>${e(c.name)}</option>`).join('')}</select>` : ''}${mode === 'university' ? `<label for="court-university">University</label><select id="court-university">${sampleUniversities.map(u => `<option value="${e(u.id)}" ${u.id === university.id ? 'selected' : ''}>${e(u.name)}</option>`).join('')}</select>` : ''}</div></div>
    <div class="court-ranking-summary"><span>01 / DEMONSTRATION RANKINGS</span><strong>${rows.length ? rows[0][metric] : 0}</strong><small>Leading sample ${metric}</small></div>
    <div class="court-ranking-list">${rankRows}</div></div>
    <section class="module-panel court-university-overview"><div class="module-panel-head"><div><span>SAMPLE UNIVERSITY ACTIVITY</span><h2>Example university totals</h2></div><span class="module-sample-label">Demo</span></div>
      ${universities.map((u, index) => `<div class="court-school-row"><span>#${index + 1}</span><strong>${e(u.name)}</strong><span>${u.contributors} example members</span><b>${u.contributions} sample contributions</b></div>`).join('')}
    </section>
    <p class="module-disclaimer">Neither UT Dallas nor UT Arlington is being formally ranked by this demonstration. All names, numbers and activities are illustrative.</p>
  </div>`;
}
