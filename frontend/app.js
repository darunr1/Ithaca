import { api } from './shared/api.js';
import { e } from './shared/ui.js';
import { renderHome } from './core/home.js';
import { renderAthena } from './core/athena.js';
import { renderKleos } from './core/kleos.js';
import { renderCourt } from './recruiting/court.js';
import { renderBow } from './recruiting/bow.js';
const pages = { home: ['Ithaca Home', renderHome], athena: ['Athena', renderAthena], kleos: ['Kleos Ledger', renderKleos], court: ['The Court', renderCourt], bow: ['Bow', renderBow] };
let revision = 0;
async function render(argument) {
  const currentRevision = ++revision;
  const key = location.hash.slice(1) || 'home';
  const [title, view] = pages[key] || pages.home;
  document.title = `${title} · Ithaca`;
  document.querySelector('#breadcrumb').textContent = title;
  document.querySelectorAll('nav a').forEach(link => { if (link.dataset.page === (pages[key] ? key : 'home')) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  const content = document.querySelector('#content');
  content.setAttribute('aria-busy', 'true');
  try {
    const html = await view(argument);
    if (currentRevision !== revision) return;
    content.innerHTML = html;
    document.querySelector('#ranking-range')?.addEventListener('change', event => render(event.target.value));
    document.querySelector('#skill-search')?.addEventListener('submit', event => { event.preventDefault(); render(new FormData(event.target).get('skill')); });
  } catch (error) {
    if (currentRevision !== revision) return;
    content.innerHTML = `<div class="notice" role="alert">${e(error.message)} No replacement demo data was loaded.</div><button id="retry">Try again</button>`;
    document.querySelector('#retry').addEventListener('click', () => render(argument));
  } finally { if (currentRevision === revision) content.removeAttribute('aria-busy'); }
}
window.addEventListener('hashchange', () => render());
try {
  const result = await api('/health');
  document.querySelector('#connection').textContent = `${result.meta.mode === 'demo' ? 'Fictional demo' : 'Atlas connected'} · AI ${result.data.ai}`;
} catch { document.querySelector('#connection').textContent = 'Backend unavailable'; }
render();
