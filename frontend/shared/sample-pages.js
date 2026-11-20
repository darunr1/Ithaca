// Read-only sample surfaces. Never submit any data from these previews to backend APIs.
import { e } from './ui.js';
import { SAMPLE_NOTICE, sampleClubs, sampleUniversities, sampleMembers, sampleContributions, sampleAttendance, sampleLedger, sampleCourt } from './sample-preview.js';

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


export function sampleHomePage() {
  const leaders = sampleCourt('global').rows.slice(0, 8);
  const points = [...sampleContributions, ...sampleAttendance].reduce((sum, entry) => sum + entry.points, 0);
  const rows = leaders.map(member => '<div class="module-person-row"><span class="module-rank">#' + member.rank + '</span><span class="module-avatar">' + e(member.name.split(' ').slice(0, 2).map(part => part[0]).join('')) + '</span><div><strong>' + e(member.name) + '</strong><small>' + e(member.major) + ' · Example profile</small></div><span class="module-score">' + member.contributions + ' examples</span></div>').join('');
  return '<div class="module-page module-home module-sample-page">' +
    '<header class="module-hero"><div><span class="module-kicker">ITHACA / EXPLORE THE DEMO</span><h1>See what a populated workspace looks like.</h1><p>Explore fictional engineers, student clubs, documented contributions and activity rankings before your own organization has records.</p></div><img class="module-hero-symbol module-hero-logo" src="/assets/ithaca-mark.png" alt="" aria-hidden="true"></header>' +
    '<section class="module-sample-banner"><span class="module-sample-label">DEMO DATA</span><div><strong>Illustrative records, not real student activity</strong><p>' + e(SAMPLE_NOTICE) + '</p></div></section>' +
    '<div class="module-heading"><div><span>EXAMPLE OVERVIEW</span><h2>A busy engineering community</h2></div><p>All totals are calculated from the sample dataset.</p></div>' +
    '<div class="module-metrics"><article><span>Sample members</span><strong>' + sampleMembers.length + '</strong><small>Fictional student profiles</small></article><article><span>Example clubs</span><strong>' + sampleClubs.length + '</strong><small>Across ' + sampleUniversities.length + ' sample campuses</small></article><article><span>Sample contributions</span><strong>' + sampleContributions.length + '</strong><small>Invented project evidence</small></article><article><span>Activity points</span><strong>' + points + '</strong><small>Illustrative scoring only</small></article></div>' +
    '<div class="module-two-col"><section class="module-panel"><div class="module-panel-head"><div><span>EXAMPLE PEOPLE</span><h2>Active sample contributors</h2></div><a href="#court">View rankings →</a></div>' + rows + '</section>' +
    '<section class="module-panel"><div class="module-panel-head"><div><span>DISCOVER THE PRODUCT</span><h2>Explore populated examples</h2></div></div><div class="module-link-grid">' +
    '<a href="#kleos"><strong>Kleos Ledger</strong><small>Explore all fictional members, evidence and points</small><span>↗</span></a>' +
    '<a href="#court"><strong>The Court</strong><small>Compare sample club and university leaderboards</small><span>↗</span></a>' +
    '<a href="#bow"><strong>Bow</strong><small>Preview read-only officer succession shortlists</small><span>↗</span></a>' +
    '<a href="#athena"><strong>Athena</strong><small>Use your real club documents after joining a team</small><span>↗</span></a>' +
    '</div></section></div>' +
    '<p class="module-disclaimer">Sample records are rendered only in the browser. They are not user accounts, Atlas activity, validated contributions, or recruiter-visible profiles.</p></div>';
}

// No nominations or appointments can be submitted from this preview.
export function sampleBowPage() {
  const roles = [
    { clubId: 'sample-ithaca', title: 'Project Knowledge Lead', description: 'Own document retrieval quality and technical handoff.', skills: ['RAG', 'Search', 'Backend APIs'] },
    { clubId: 'sample-robotics', title: 'Embedded Systems Lead', description: 'Coordinate firmware validation and rover diagnostics.', skills: ['CAN', 'Embedded C', 'Motor control'] },
    { clubId: 'sample-solar', title: 'Telemetry Lead', description: 'Maintain powertrain telemetry and the test-data workflow.', skills: ['Telemetry', 'CAN', 'Data pipelines'] }
  ];
  const cards = roles.map(role => {
    const club = sampleClubs.find(item => item.id === role.clubId);
    const candidates = sampleLedger(role.clubId).members.filter(member => !member.officer).slice(0, 3);
    return '<article class="bow-role-card"><div class="bow-role-header"><span class="module-panel-kicker">EXAMPLE ROLE · ' + e(club.name) + '</span><span class="module-sample-label">Demo</span></div><h3>' + e(role.title) + '</h3><p>' + e(role.description) + '</p>' +
      '<div class="bow-skill-tags">' + role.skills.map(skill => '<span>' + e(skill) + '</span>').join('') + '</div>' +
      '<div class="bow-candidates-heading"><strong>Illustrative candidate shortlist</strong><small>Sample scores demonstrate a workflow, not a real selection decision.</small></div>' +
      '<div class="bow-candidates">' + candidates.map(member => '<div class="bow-candidate"><span class="module-avatar">' + e(member.name.split(' ').map(word => word[0]).slice(0, 2).join('')) + '</span><div class="bow-candidate-person"><strong>' + e(member.name) + '</strong><small>' + member.contributions + ' fictional contributions · ' + member.points + ' sample points</small></div><span class="module-sample-label">Example</span></div>').join('') + '</div></article>';
  }).join('');
  return '<div class="module-page module-bow module-sample-page"><header class="module-hero bow-hero"><div><span class="module-kicker">BOW / INTERACTIVE DEMO</span><h1>Explore a future leadership handoff.</h1><p>See fictional candidates for three example officer roles, using the same sample profiles as Kleos Ledger.</p></div></header>' +
    sampleBanner() + '<div class="module-heading"><div><span>FICTIONAL DEMONSTRATION</span><h2>Officer succession examples</h2></div><p>Read-only preview. No nominations, appointments or permission changes.</p></div>' +
    '<div class="bow-role-grid">' + cards + '</div><p class="module-disclaimer">Real succession decisions must be made by authorized club officers using real evidence and student consent. Example shortlists do not award roles.</p></div>';
}
