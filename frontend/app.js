import { api, currentMemberId, setCurrentMemberId } from './shared/api.js';
import { e, initials } from './shared/ui.js';
import { renderHome } from './core/home.js';
import { renderAthena, bindAthena } from './core/athena.js';
import { renderKleos, bindKleos } from './core/kleos.js';
import { renderMember } from './core/member.js';
import { bindCourtSuggestions } from './recruiting/suggestions.js';
import { renderCourt } from './recruiting/court.js';
import { renderBow } from './recruiting/bow.js';
// [title, view, bind?, nav section]
const pages = { home: ['Ithaca Home', renderHome], athena: ['Athena', renderAthena], kleos: ['Kleos Ledger', renderKleos, bindKleos], member: ['Member stats', renderMember, null, 'kleos'], court: ['The Court', renderCourt], bow: ['Bow', renderBow] };
let revision = 0;
async function render(argument) {
  const currentRevision = ++revision;
  const [route, param] = (location.hash.slice(1) || 'home').split('/');
  const key = pages[route] ? route : 'home';
  const [title, view, bind, section = key] = pages[key];
  document.title = `${title} · Ithaca`;
  document.querySelector('#breadcrumb').textContent = title;
  document.querySelectorAll('nav a').forEach(link => { if (link.dataset.page === section) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  const content = document.querySelector('#content');
  content.setAttribute('aria-busy', 'true');
  try {
    const html = await view(argument === undefined && param ? decodeURIComponent(param) : argument);
    if (currentRevision !== revision) return;
    content.innerHTML = html;
    if (argument === undefined) window.scrollTo(0, 0);
    bind?.(content, next => render(next)); // Kleos binds its own controls, including #ranking-range
    if (key === 'athena') bindAthena();
    bindCourtSuggestions(content);
    document.querySelector('#court-search')?.addEventListener('submit', event => { event.preventDefault(); render(Object.fromEntries(new FormData(event.target))); });
    document.querySelector('#court-clear')?.addEventListener('click', () => render({}));
  } catch (error) {
    if (currentRevision !== revision) return;
    content.innerHTML = `<div class="notice" role="alert">${e(error.message)} No replacement demo data was loaded.</div><button id="retry">Try again</button>`;
    document.querySelector('#retry').addEventListener('click', () => render(argument));
  } finally { if (currentRevision === revision) content.removeAttribute('aria-busy'); }
}
// "Viewing as" picker: switches the demo identity so officer and member views can be compared.
async function setupIdentity() {
  const select = document.querySelector('#identity');
  const identity = await api('/auth/me');
  if (identity.meta.authentication === 'clerk') {
    const profile = identity.data.profile;
    document.querySelector('#identity-avatar').textContent = initials(profile.name);
    document.querySelector('#identity-name').textContent = profile.name;
    document.querySelector('#identity-detail').textContent = [profile.major, profile.universityId].filter(Boolean).join(' · ');
    setCurrentMemberId(profile.internalMemberId);
    return;
  }
  const { data: clubs } = await api('/clubs');
  const rosters = await Promise.all(clubs.map(c => api(`/clubs/${c.id}/roster`)));
  const seen = new Set();
  select.innerHTML = clubs.map((club, i) => `<optgroup label="${e(club.name)}">${rosters[i].data.filter(m => !seen.has(m.id) && seen.add(m.id)).map(m => `<option value="${e(m.id)}">${e(m.name)}${club.officerIds.includes(m.id) ? ' · Officer' : ''}</option>`).join('')}</optgroup>`).join('');
  const describe = () => {
    const member = rosters.flatMap(r => r.data).find(m => m.id === select.value);
    const club = clubs.find(c => c.id === member?.clubIds[0]);
    document.querySelector('#identity-avatar').textContent = initials(member?.name);
    document.querySelector('#identity-name').textContent = member?.name ?? 'Unknown';
    document.querySelector('#identity-detail').textContent = club ? `${club.officerIds.includes(member.id) ? 'Officer' : 'Member'} · ${club.name}` : 'Demo identity';
  };
  select.value = seen.has(currentMemberId()) ? currentMemberId() : select.options[0]?.value;
  setCurrentMemberId(select.value);
  describe();
  select.addEventListener('change', () => { setCurrentMemberId(select.value); describe(); render(); });
}
window.addEventListener('hashchange', () => render());
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  try { await fetch('/api/athena-dev-session', { method: 'POST', credentials: 'same-origin' }); } catch { /* normal auth handles non-local environments */ }
}
try {
  const result = await api('/health');
  document.querySelector('#connection').textContent = `${result.meta.mode === 'demo' ? 'Fictional demo' : 'Atlas connected'} · AI ${result.data.ai}`;
} catch { document.querySelector('#connection').textContent = 'Backend unavailable'; }
try { await setupIdentity(); } catch { document.querySelector('#identity-detail').textContent = 'Identity list unavailable'; }
render();
