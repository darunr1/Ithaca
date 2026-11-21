import { api } from '../shared/api.js';
import { e } from '../shared/ui.js';
import { sampleCourtPage } from '../shared/sample-pages.js';

const state = { mode: 'clubs', clubId: '', universityId: '', preview: null, sampleClubId: 'sample-ithaca', sampleUniversityId: 'sample-utd' };
function scoreRows(rows, metric, who) {
  if (!rows.length) return '<div class="module-empty-state"><strong>No ranked activity yet</strong><p>Rankings appear automatically after officers approve real contributions or record attendance. No sample scores are inserted.</p></div>';
  return `<div class="court-ranking-list">${rows.map((item, index) => `<article class="court-ranking-row ${index < 3 ? 'court-top-three' : ''}">
    <div class="court-place">#${e(item.rank ?? (index + 1))}</div><div class="court-ranking-person"><strong>${e(who(item))}</strong><small>${e(item.major || item.clubs?.join(', ') || '')}</small></div>
    <div class="court-ranking-score"><strong>${e(item[metric] ?? 0)}</strong><small>${metric === 'contributions' ? 'Approved contributions' : 'Activity points'}</small></div>
  </article>`).join('')}</div>`;
}
export async function renderCourt(input = {}) {
  if (input && typeof input === 'object') Object.assign(state, Object.fromEntries(Object.entries(input).filter(([key]) => ['mode', 'clubId', 'universityId'].includes(key))));
  const [{ data: clubs }, { data: universities }, { data: leaderboard }, { data: me }] = await Promise.all([
    api('/clubs'), api('/universities'), api('/leaderboard'), api('/auth/me')
  ]);
  if (!state.clubId || !clubs.some(c => c.id === state.clubId)) state.clubId = clubs[0]?.id || '';
  const meUniversity = me.profile?.universityId || clubs[0]?.universityId || universities[0]?.universityId || '';
  if (!state.universityId) state.universityId = universities.find(u => u.universityId === meUniversity)?.universityId || meUniversity || '';
  const visibleSchool = universities.find(u => u.universityId === state.universityId);
  const club = clubs.find(c => c.id === state.clubId);
  const [clubRanks, schoolRanks] = await Promise.all([
    club ? api(`/clubs/${encodeURIComponent(club.id)}/rankings?range=all`).then(r => r.data) : Promise.resolve(null),
    state.universityId ? api(`/universities/${encodeURIComponent(state.universityId)}/leaderboard`).then(r => r.data).catch(() => null) : Promise.resolve(null)
  ]);
  const clubRows = clubRanks?.rows || [];
  const schoolRows = schoolRanks?.rows || [];
  const globalRows = leaderboard.rows || [];
  const sampleMode = state.preview === true || (state.preview === null && !clubRows.length && !schoolRows.length && !globalRows.length);
  if (sampleMode) return sampleCourtPage({ mode: state.mode, clubId: state.sampleClubId, universityId: state.sampleUniversityId });
  const rows = state.mode === 'clubs' ? clubRows : state.mode === 'university' ? schoolRows : globalRows;
  const metric = state.mode === 'clubs' ? 'points' : 'contributions';
  const title = state.mode === 'clubs' ? club?.name || 'Your club' : state.mode === 'university' ? schoolRanks?.university?.name || visibleSchool?.name || me.profile?.universityName || 'Your university' : 'Across participating universities';
  const selected = state.mode === 'clubs' ? 'Club' : state.mode === 'university' ? 'University' : 'Cross-university';
  return `<div class="module-page module-court">
    <header class="module-hero court-hero"><div><span class="module-kicker">THE COURT / ENGINEERING RECOGNITION</span><h1>Where the work speaks.</h1><p>Discover the people and organizations making measurable contributions, backed by the work actually recorded in Ithaca.</p></div><div class="module-hero-symbol" aria-hidden="true">◎</div></header>
    ${me.profile ? '<div class="module-live-preview-control"><span>Live club and university records · no sample results</span><button type="button" data-sample-show-demo>Explore populated demo</button></div>' : ''}
    <div class="module-heading"><div><span>LEADERBOARDS / RECORDED ACTIVITY</span><h2>Rankings and recognition</h2></div><p>Never an assessment of someone's potential or engineering ability.</p></div>
    <div class="court-tabs" role="group" aria-label="Ranking scope">
      <button type="button" data-court-mode="clubs" ${state.mode === 'clubs' ? 'aria-pressed="true"' : ''}>My club</button>
      <button type="button" data-court-mode="university" ${state.mode === 'university' ? 'aria-pressed="true"' : ''}>University</button>
      <button type="button" data-court-mode="global" ${state.mode === 'global' ? 'aria-pressed="true"' : ''}>All universities</button>
    </div>
    <div class="court-ranking-shell">
      <div class="court-ranking-header"><div><span class="module-panel-kicker">${e(selected.toUpperCase())} / LEADERBOARD</span><h2>${e(title)}</h2><p>${rows.length} ranked contributors · ${state.mode === 'clubs' ? 'Contributions + attendance' : 'Approved contributions only'}</p></div>
        <div class="court-filters">
          ${state.mode === 'clubs' && clubs.length > 1 ? `<label for="court-club">Club</label><select id="court-club">${clubs.map(c => `<option value="${e(c.id)}" ${state.clubId === c.id ? 'selected' : ''}>${e(c.name)}</option>`).join('')}</select>` : ''}
          ${state.mode === 'university' ? `<label for="court-university">University</label><select id="court-university"><option value="${e(meUniversity)}">${e(me.profile?.universityName || 'My university')}</option>${universities.filter(u => u.universityId !== meUniversity).map(u => `<option value="${e(u.universityId)}" ${state.universityId === u.universityId ? 'selected' : ''}>${e(u.name)}</option>`).join('')}</select>` : ''}
        </div>
      </div>
      <div class="court-ranking-summary"><span>01 / Rankings update from verified activity</span><strong>${rows.length ? e(rows[0][metric]) : '0'}</strong><small>Leading ${metric === 'points' ? 'points' : 'contribution count'} in view</small></div>
      ${scoreRows(rows, metric, row => row.name)}
    </div>
    <section class="module-panel court-university-overview"><div class="module-panel-head"><div><span>UNIVERSITY ACTIVITY</span><h2>Participating universities</h2></div><span class="module-muted">Officer-approved work only</span></div>
      ${universities.length ? universities.slice(0, 15).map((u, i) => `<div class="court-school-row"><span>#${i + 1}</span><strong>${e(u.name)}</strong><span>${u.contributors} contributors</span><b>${u.contributions} contributions</b></div>`).join('') : '<p class="module-empty">No universities have approved contributions yet. Your club can be the first.</p>'}
    </section>
    <p class="module-disclaimer">All rankings are descriptive, not a prediction of competence. University-level rankings use approved contribution records; club activity also includes attendance.</p>
  </div>`;
}
export function bindCourt(root, rerender) {
  root.querySelector('[data-sample-show-live]')?.addEventListener('click', () => rerender({ preview: false }));
  root.querySelector('[data-sample-show-demo]')?.addEventListener('click', () => rerender({ preview: true }));
  if (root.querySelector('.module-sample-page')) {
    root.querySelectorAll('[data-court-mode]').forEach(button => button.addEventListener('click', () => rerender({ mode: button.dataset.courtMode, preview: true })));
    root.querySelector('#court-university')?.addEventListener('change', event => rerender({ sampleUniversityId: event.target.value, preview: true }));
    root.querySelector('#court-club')?.addEventListener('change', event => rerender({ sampleClubId: event.target.value, preview: true }));
    return;
  }
  root.querySelectorAll('[data-court-mode]').forEach(button => button.addEventListener('click', () => rerender({ mode: button.dataset.courtMode })));
  root.querySelector('#court-university')?.addEventListener('change', event => rerender({ universityId: event.target.value }));
  root.querySelector('#court-club')?.addEventListener('change', event => rerender({ clubId: event.target.value }));
}
