import { readFileSync } from 'node:fs';
// College directory search for the Kleos "Most contributions" picker.
// Source: backend/data/college-directory.csv (public College Board directory export, 2026-11-14).
const STOP = new Set(['of', 'the', 'at', 'in', 'and', 'for', 'a']);
// Common nicknames that plain acronym/prefix matching gets wrong. Values are exact directory names.
const ALIASES = {
  mit: 'Massachusetts Institute of Technology', 'georgia tech': 'Georgia Institute Of Technology', gatech: 'Georgia Institute Of Technology',
  caltech: 'California Institute of Technology', cmu: 'Carnegie Mellon University', nyu: 'New York University',
  usc: 'University of Southern California', ucla: 'University of California: Los Angeles', ucsd: 'University of California: San Diego',
  berkeley: 'University of California: Berkeley', 'uc berkeley': 'University of California: Berkeley', ucb: 'University of California: Berkeley',
  'penn state': 'Penn State University Park', psu: 'Penn State University Park', upenn: 'University of Pennsylvania', penn: 'University of Pennsylvania',
  uta: 'University of Texas at Arlington', utd: 'University of Texas at Dallas', 'ut dallas': 'University of Texas at Dallas',
  'ut austin': 'University of Texas at Austin', utsa: 'University of Texas at San Antonio', utep: 'University of Texas at El Paso',
  tamu: 'Texas A&M University', 'texas a m': 'Texas A&M University', umich: 'University of Michigan Ann Arbor', 'u mich': 'University of Michigan Ann Arbor',
  uiuc: 'University Of Illinois Urbana Champaign', 'virginia tech': 'Virginia Polytechnic Institute and State University', vt: 'Virginia Polytechnic Institute and State University',
  rpi: 'Rensselaer Polytechnic Institute', rit: 'Rochester Institute of Technology', wpi: 'Worcester Polytechnic Institute', njit: 'New Jersey Institute of Technology',
  uw: 'University of Washington', 'uw madison': 'University of Wisconsin-Madison', unc: 'University of North Carolina at Chapel Hill',
  'ohio state': 'Ohio State University: Columbus Campus', osu: 'Ohio State University: Columbus Campus', asu: 'Arizona State University', ucf: 'University of Central Florida',
  fiu: 'Florida International University', fsu: 'Florida State University', uf: 'University of Florida', lsu: 'Louisiana State University And Agricultural And Mechanical College',
  byu: 'Brigham Young University', smu: 'Southern Methodist University', tcu: 'Texas Christian University', unt: 'University of North Texas', uh: 'University of Houston'
};
const ALIAS_INDEX = new Map(Object.entries(ALIASES).map(([alias, name]) => [alias, name.toLowerCase()]));
export const normalize = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function indexEntry(entry) {
  const norm = normalize(entry.name);
  const words = norm.split(' ').filter(w => w && !STOP.has(w));
  return { ...entry, norm, words, acronym: words.map(w => w[0]).join('') };
}
// One edit (substitution, insertion or deletion) between a and b.
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
// How well one query token matches the entry's words: prefix > acronym run > typo.
function tokenScore(token, entry) {
  if (STOP.has(token)) return 1;
  if (entry.words.some(w => w === token)) return 4;
  if (entry.words.some(w => w.startsWith(token))) return 3;
  if (token.length >= 2 && token.length <= 5 && entry.acronym.includes(token)) return 2;
  if (token.length >= 5 && entry.words.some(w => withinOneEdit(token, w.slice(0, token.length)) || withinOneEdit(token, w))) return 1;
  return 0;
}
export function scoreEntry(query, entry) {
  const q = normalize(query);
  if (!q) return 0;
  if (entry.norm === q) return 1000;
  if (ALIAS_INDEX.get(q) === entry.name.toLowerCase()) return 950;
  const compact = q.replace(/ /g, '');
  let score = 0;
  if (entry.acronym === compact && compact.length >= 2) score = 800;
  else if (entry.norm.startsWith(q)) score = 600;
  else if (entry.norm.includes(q)) score = 400;
  const tokens = q.split(' ');
  const parts = tokens.map(t => tokenScore(t, entry));
  if (parts.every(p => p > 0)) {
    const first = tokens.find(t => !STOP.has(t));
    const leads = first && entry.words[0]?.startsWith(first) ? 30 : 0;
    score = Math.max(score, 200 + parts.reduce((s, p) => s + p * 20, 0) + leads);
  }
  if (!score) return 0;
  return score - entry.norm.length * 0.3 + (entry.registered ? 50 : 0);
}
export function createCollegeDirectory(file = new URL('../data/college-directory.csv', import.meta.url)) {
  const [, ...rows] = parseCsv(readFileSync(file, 'utf8'));
  const entries = rows.filter(r => r[0]).map(([name, state, country, url]) => {
    const slug = (url || '').split('/').filter(Boolean).pop() || normalize(name).replace(/ /g, '-');
    return indexEntry({ id: `cb-${slug}`, name: name.trim(), state: state?.trim() || null, country: country?.trim() || null, registered: false });
  });
  const byId = new Map(entries.map(e => [e.id, e]));
  return {
    size: entries.length,
    get: id => byId.get(id) ?? null,
    // `registered` are Ithaca universities; a directory entry with the same name resolves to the registered one.
    search(query, { registered = [], limit = 8 } = {}) {
      const own = registered.map(u => indexEntry({ id: u.id, name: u.name, state: null, country: null, registered: true }));
      const ownNames = new Set(own.map(u => u.norm));
      return [...own, ...entries.filter(e => !ownNames.has(e.norm))]
        .map(entry => ({ entry, score: scoreEntry(query, entry) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
        .slice(0, limit)
        .map(({ entry: { id, name, state, country, registered: isRegistered } }) => ({ id, name, location: [state, country].filter(Boolean).join(', ') || null, registered: isRegistered }));
    }
  };
}
