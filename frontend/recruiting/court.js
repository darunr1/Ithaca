import { searchProfiles, getDiscoveryOptions } from './discovery.js';
import { e, heading, notice, sourceCard } from '../shared/ui.js';
export async function renderCourt(filters = {}) {
  if (typeof filters === 'string') filters = { skill: filters };
  const [allProfiles, directoryOptions] = await Promise.all([searchProfiles(), getDiscoveryOptions()]);
  const profiles = Object.values(filters).some(value => String(value ?? '').trim()) ? await searchProfiles(filters) : allProfiles;
  const years = ['Freshman', 'Sophomore', 'Junior', 'Senior'];
  const suggestions = {
    state: directoryOptions.state,
    name: allProfiles.map(p => p.member.name),
    skill: allProfiles.flatMap(p => p.contributions.flatMap(c => c.skills)),
    major: [...directoryOptions.major, ...allProfiles.map(p => p.member.major)],
    university: [...directoryOptions.university, ...allProfiles.map(p => p.university?.name)],
    club: [...directoryOptions.club, ...allProfiles.flatMap(p => p.clubs.map(c => c.name))]
  };
  const input = (key, label, placeholder) => `<div class="court-field"><label for="court-${key}">${label}</label><div class="court-combobox"><input id="court-${key}" name="${key}" value="${e(filters[key])}" placeholder="${placeholder}" maxlength="${key === 'university' ? 200 : 80}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="court-${key}-options" autocomplete="off"><span class="court-chevron" aria-hidden="true"></span><div id="court-${key}-options" class="court-options" role="listbox" aria-label="${label} suggestions" hidden>${[...new Set(suggestions[key].filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((value, i) => `<div id="court-${key}-option-${i}" class="court-option" role="option" aria-selected="false" data-value="${e(value)}">${e(value)}</div>`).join('')}</div></div></div>`;
  return `${heading('THE COURT / RECOGNITION & OPPORTUNITY', 'Discover the work. Meet the engineer.', 'Find students, future teammates, and the next generation of club leaders.')}${notice('Fictional discovery preview. Only opted-in members appear. Connections and student acceptance are planned.')}
  <form id="court-search" class="panel court-search" role="search" aria-label="Search students">
    <div class="court-search-heading"><div><p class="eyebrow">STUDENT DIRECTORY</p><h2>Find your next collaborator</h2><p class="body-copy">Search by name or demonstrated skills, then narrow your results.</p></div><span class="pill outline">Opted-in students only</span></div>
    <div class="court-fields court-primary-fields">
      ${input('name', 'Real name', 'e.g. Leo Marin')}
      ${input('skill', 'Skills', 'e.g. CAN or firmware')}
    </div>
    <div class="court-filter-label">NARROW YOUR SEARCH <span>All filters are optional</span></div>
    <div class="court-fields court-secondary-fields">
      ${input('major', 'Major', 'e.g. Computer Engineering')}
      ${input('university', 'University', 'e.g. Aster University')}
      ${input('state', 'State', 'e.g. Texas')}
      <div class="court-field"><label for="court-year">Year of study</label><select id="court-year" name="year"><option value="">Any year</option>${years.map((label, i) => { const year = i + 1; return `<option value="${year}"${String(filters.year) === String(year) ? ' selected' : ''}>${label}</option>`; }).join('')}</select></div>
      ${input('club', 'Club', 'e.g. Rocketry')}
    </div>
    <div class="court-search-footer"><p>Skills are backed by approved contributions.</p><div class="actions"><button type="button" id="court-clear" class="secondary">Clear filters</button><button type="submit">Search students <span aria-hidden="true">&rarr;</span></button></div></div>
  </form>
  <div class="court-results-heading"><h2>Meet the engineers</h2><p class="body-copy" role="status">${profiles.length} ${profiles.length === 1 ? 'student' : 'students'} found</p></div>
  <div class="profile-grid court-profiles">${profiles.map(p => `<section class="panel court-profile"><div class="section-title"><div><p class="eyebrow">OPTED INTO DISCOVERY</p><h2>${e(p.member.name)}</h2></div><span class="avatar" aria-hidden="true">${e(p.member.name.split(' ').map(n => n[0]).join(''))}</span></div><p class="body-copy">${e(p.member.major || 'Major not provided')}<br>${e(p.university?.name || 'University not provided')}${p.university?.state ? `, ${e(p.university.state)}` : ''} &middot; ${e(years[p.member.year - 1] || 'Year not provided')}</p><div class="tags">${p.clubs.map(c => `<span>${e(c.name)}</span>`).join('')}</div><div class="court-profile-work"><p class="court-work-label">DEMONSTRATED SKILLS</p><div class="tags">${[...new Set(p.contributions.flatMap(c => c.skills))].map(skill => `<span>${e(skill)}</span>`).join('') || '<span>No reviewed skills yet</span>'}</div>${p.contributions.length ? `<details class="court-evidence"><summary>View ${p.contributions.length} approved ${p.contributions.length === 1 ? 'contribution' : 'contributions'}</summary><div>${p.contributions.map(sourceCard).join('')}</div></details>` : '<p class="empty">No approved engineering evidence yet.</p>'}</div><div class="court-profile-footer"><button disabled>Request connection &middot; planned</button></div></section>`).join('') || '<p class="empty">No opted-in profiles match your filters. Try fewer filters or clear them to see everyone available.</p>'}</div>`;
}
