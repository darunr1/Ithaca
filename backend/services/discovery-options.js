import { readFile } from 'node:fs/promises';

// CSV supports quoted commas, escaped quotes, CRLF and multiline fields.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field.trim()); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('Unclosed quote in suggestion CSV.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

async function column(filename, header) {
  const rows = parseCsv(await readFile(new URL(`../../demo-data/${filename}`, import.meta.url), 'utf8'));
  const index = rows[0]?.indexOf(header) ?? -1;
  if (index < 0) throw new Error(`Missing ${header} column in ${filename}.`);
  return [...new Set(rows.slice(1).map(row => row[index]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

let cached;
export async function discoveryOptions() {
  if (!cached) {
    cached = Promise.all([
      column('engineering_majors.csv', 'Engineering_Major'),
      column('College_Directory_20261114.csv', 'Name of Institution'),
      column('top_us_engineering_clubs.csv', 'Club / Organization Name'),
      column('us_states.csv', 'State')
    ]).then(([major, university, club, state]) => ({ major, university, club, state })).catch(error => { cached = undefined; throw error; });
  }
  return cached;
}
