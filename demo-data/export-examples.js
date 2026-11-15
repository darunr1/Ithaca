// Regenerate frontend read-response mocks after fixture changes:
// node demo-data/export-examples.js
import { writeFile } from 'node:fs/promises';
import { createRepository } from '../backend/repositories/records.js';
import { createWorkspace } from '../backend/services/workspace.js';
const repo = createRepository(null), workspace = createWorkspace(repo);
const wrap = data => ({ data, meta: { mode: 'demo', fictional: true, foundation: true } });
const examples = {
  'GET /api/health': wrap({ status: 'ok', database: 'disabled', ai: 'mock', authentication: 'not-implemented' }),
  'GET /api/clubs': wrap(await repo.list('clubs')),
  'GET /api/clubs/club-rocketry/roster': wrap(await workspace.roster('club-rocketry')),
  'GET /api/clubs/club-rocketry/sessions': wrap(await repo.list('sessions', { clubId: 'club-rocketry' })),
  'GET /api/clubs/club-rocketry/drafts': wrap(await repo.list('drafts', { clubId: 'club-rocketry' })),
  'GET /api/members/member-leo': wrap(await workspace.profile('member-leo')),
  'GET /api/clubs/club-rocketry/rankings?range=all': wrap(await workspace.rankings('club-rocketry', 'all', '2026-11-14')),
  'GET /api/recruiter/profiles': wrap(await workspace.discovery()),
  'GET /api/clubs/club-rocketry/semesters (X-Demo-Member: member-iris)': wrap(await workspace.semesters('club-rocketry', await workspace.actor('member-iris'))),
  'GET /api/universities': wrap(await workspace.universityTotals()),
  'GET /api/universities/uni-aster/leaderboard': wrap(await workspace.universityLeaderboard('uni-aster'))
};
await writeFile(new URL('./api-examples.json', import.meta.url), JSON.stringify(examples, null, 2) + '\n');
console.log('Updated read-response examples. Planned write examples remain in docs/API.md.');
