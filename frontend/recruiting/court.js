import { api } from '../shared/api.js';
import { e, heading, notice, sourceCard } from '../shared/ui.js';
export async function renderCourt(skill = '') {
  const { data: profiles } = await api(`/recruiter/profiles${skill ? `?skill=${encodeURIComponent(skill)}` : ''}`);
  return `${heading('THE COURT / RECOGNITION & OPPORTUNITY', 'Discover the work. Meet the engineer.', 'Opted-in profiles, grounded in reviewed engineering contributions.')}${notice('Fictional recruiter preview. Connections and student acceptance are planned. Personal contact details are never included in discovery responses.')}
  <form id="skill-search" class="search"><label for="skill">Find documented skills</label><input id="skill" name="skill" value="${e(skill)}" placeholder="Try CAN, PCB, or firmware" maxlength="80"><button>Search evidence</button></form>
  <div class="profile-grid">${profiles.map(p => `<section class="panel"><div class="section-title"><div><p class="eyebrow">OPTED INTO DISCOVERY</p><h2>${e(p.member.name)}</h2></div><span class="avatar">${e(p.member.name.split(' ').map(n => n[0]).join(''))}</span></div><p class="body-copy">${e(p.member.major)}</p>${p.contributions.map(sourceCard).join('') || '<p class="empty">No approved engineering evidence yet.</p>'}<button disabled>Request connection · planned</button></section>`).join('') || '<p class="empty">No opted-in profiles match that documented skill.</p>'}</div>`;
}
