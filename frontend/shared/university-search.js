// Search-as-you-type for the university field, using the college list in /data/colleges.csv.
// Every typed word must match the start of a word in the college name, in any order
// ("tex dal" finds "University of Texas at Dallas"). Typing stays free text if nothing matches.

const CSS = `
.uni-search{position:relative}
.uni-search-list{position:absolute;z-index:50;left:0;right:0;top:calc(100% + 4px);margin:0;padding:4px;list-style:none;background:#fff;
  border:1px solid #dce2dc;border-radius:8px;box-shadow:0 12px 30px rgba(20,45,59,.18);max-height:280px;overflow-y:auto}
.uni-search-list[hidden]{display:none}
.uni-search-list li{padding:9px 11px;border-radius:6px;cursor:pointer;color:#203743;font-size:14px;line-height:1.3}
.uni-search-list li small{display:block;font-size:12px;color:#65777c}
.uni-search-list li[aria-selected="true"],.uni-search-list li:hover{background:#edf4f3}
.uni-search-list b{font-weight:700}
.uni-search-list .uni-search-empty{cursor:default;color:#65777c}
`;

const words = text => text.toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);

function parseCsv(text) {
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

let collegesPromise;
function loadColleges() {
  collegesPromise ||= fetch('/data/colleges.csv')
    .then(response => { if (!response.ok) throw new Error('College list unavailable'); return response.text(); })
    .then(text => parseCsv(text).slice(1).filter(row => row[0]).map(([name, state, country]) => ({
      name: name.trim(),
      place: [state, country].map(v => (v || '').trim()).filter(Boolean).join(', '),
      words: words(name)
    })));
  return collegesPromise;
}

function search(colleges, query) {
  const typed = words(query);
  if (!typed.length) return [];
  const phrase = query.trim().toLowerCase();
  return colleges
    .filter(college => typed.every(t => college.words.some(w => w.startsWith(t))))
    .map(college => {
      const name = college.name.toLowerCase();
      let score = 0;
      if (name === phrase) score += 100;
      else if (name.startsWith(phrase)) score += 50;
      score += typed.filter(t => college.words.includes(t)).length * 5;
      if (college.words[0].startsWith(typed[0])) score += 20;
      let at = 0;
      const inOrder = typed.every(t => { const i = college.words.findIndex((w, k) => k >= at && w.startsWith(t)); at = i + 1; return i >= 0; });
      if (inOrder) score += 10;
      return { college, score: score - college.name.length / 100 };
    })
    .sort((a, b) => b.score - a.score || a.college.name.localeCompare(b.college.name))
    .slice(0, 10)
    .map(r => r.college);
}

// Bold the typed keywords inside the college name.
function highlight(name, query) {
  const typed = words(query).sort((a, b) => b.length - a.length);
  const out = document.createDocumentFragment();
  for (const part of name.split(/([^A-Za-z0-9&]+)/)) {
    const t = typed.find(word => part.toLowerCase().startsWith(word));
    if (!t) { out.append(part); continue; }
    const b = document.createElement('b');
    b.textContent = part.slice(0, t.length);
    out.append(b, part.slice(t.length));
  }
  return out;
}

export function attachUniversitySearch(input) {
  if (!input) return;
  if (!document.getElementById('uni-search-style')) {
    const style = Object.assign(document.createElement('style'), { id: 'uni-search-style', textContent: CSS });
    document.head.append(style);
  }
  input.setAttribute('autocomplete', 'off');
  const wrapper = document.createElement('div');
  wrapper.className = 'uni-search';
  input.replaceWith(wrapper);
  const list = Object.assign(document.createElement('ul'), { className: 'uni-search-list', id: `${input.id}-list`, hidden: true });
  list.setAttribute('role', 'listbox');
  wrapper.append(input, list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');

  let results = [];
  let active = -1;

  const close = () => { list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); };
  const choose = i => { if (!results[i]) return; input.value = results[i].name; close(); };
  const highlightActive = () => list.querySelectorAll('li[role="option"]').forEach((li, i) => {
    li.setAttribute('aria-selected', String(i === active));
    if (i === active) li.scrollIntoView({ block: 'nearest' });
  });

  const update = async () => {
    const query = input.value;
    if (words(query).length === 0) { close(); return; }
    let colleges;
    try { colleges = await loadColleges(); } catch { close(); return; }
    if (input.value !== query) return;
    results = search(colleges, query);
    active = -1;
    list.replaceChildren(...(results.length ? results.map((college, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.append(highlight(college.name, query));
      if (college.place) li.append(Object.assign(document.createElement('small'), { textContent: college.place }));
      li.addEventListener('mousedown', event => { event.preventDefault(); choose(i); });
      return li;
    }) : [Object.assign(document.createElement('li'), { className: 'uni-search-empty', textContent: 'No college found. You can keep what you typed.' })]));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  input.addEventListener('input', update);
  input.addEventListener('focus', () => { loadColleges().catch(() => {}); if (input.value.trim()) update(); });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', event => {
    if (list.hidden || !results.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); active = (active + 1) % results.length; highlightActive(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); active = (active - 1 + results.length) % results.length; highlightActive(); }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(active); }
    else if (event.key === 'Escape') close();
  });
}
