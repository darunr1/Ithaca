import { readFileSync } from 'node:fs';
import { parseCsv } from './colleges.js';
// Filter options for the Kleos "Most contributions" leaderboard.
// organizations: well-known US engineering student organizations (clubs carry `organization: <acronym>`).
// majors: engineering majors (members carry `major`).
const load = name => parseCsv(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8').replace(/^﻿/, '')).slice(1);
export function createCatalog() {
  const organizations = load('engineering-organizations.csv').map(([name, acronym, discipline, type]) => ({ acronym: acronym.trim(), name: name.trim(), discipline: discipline.trim(), type: type.trim() }));
  const majors = load('engineering-majors.csv').map(([major]) => major.trim()).filter(Boolean);
  return { organizations, majors, hasOrganization: acronym => organizations.some(o => o.acronym === acronym), hasMajor: major => majors.includes(major) };
}
