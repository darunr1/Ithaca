import { fixtures } from '../../demo-data/fixtures.js';
import { leaderboardPipeline, memberHistoryPipeline, universityContributorsPipeline, universityTotalsPipeline } from '../../database/aggregations.js';
// Competition ranking (1, 2, 2, 4): ties share a rank and the next rank skips.
function withRanks(rows, same) {
  let rank = 0;
  return rows.map((row, i) => { if (i === 0 || !same(rows[i - 1], row)) rank = i + 1; return { ...row, rank }; });
}
const byCount = (a, b) => b.contributions - a.contributions || b.points - a.points;
export function createRepository(db) {
  async function list(collection, filter = {}) {
    if (db) return db.collection(collection).find(filter, { projection: { _id: 0 } }).toArray();
    return structuredClone(fixtures[collection].filter(record => Object.entries(filter).every(([key, value]) => Array.isArray(record[key]) ? record[key].includes(value) : record[key] === value)));
  }
  async function one(collection, id) { return (await list(collection, { id }))[0] ?? null; }
  return {
    list, one,
    // Demo mode keeps inserts in process memory only; they reset when the server restarts.
    async insert(collection, record) {
      if (db) { await db.collection(collection).insertOne({ ...record }); return record; }
      fixtures[collection].push(structuredClone(record));
      return record;
    },
    async history(memberId) {
      if (db) return db.collection('contributions').aggregate(memberHistoryPipeline(memberId)).toArray();
      return (await list('contributions', { memberId, status: 'approved' })).sort((a, b) => b.date.localeCompare(a.date));
    },
    async rankings(clubId, start) {
      if (db) return db.collection('contributions').aggregate(leaderboardPipeline(clubId, start)).toArray();
      const entries = [...await list('contributions', { clubId, status: 'approved' }), ...await list('attendance', { clubId })].filter(e => e.date >= start);
      const totals = new Map();
      for (const entry of entries) totals.set(entry.memberId, (totals.get(entry.memberId) || 0) + entry.points);
      const rows = [...totals].map(([memberId, points]) => ({ memberId, points, name: fixtures.members.find(m => m.id === memberId).name })).sort((a, b) => b.points - a.points || a.memberId.localeCompare(b.memberId));
      return withRanks(rows, (a, b) => a.points === b.points);
    },
    async universityContributors(universityId) {
      let rows;
      if (db) rows = await db.collection('contributions').aggregate(universityContributorsPipeline(universityId)).toArray();
      else {
        const totals = new Map();
        for (const c of await list('contributions', { universityId, status: 'approved' })) {
          const row = totals.get(c.memberId) || { memberId: c.memberId, name: fixtures.members.find(m => m.id === c.memberId).name, contributions: 0, points: 0, clubIds: [] };
          row.contributions += 1; row.points += c.points;
          if (!row.clubIds.includes(c.clubId)) row.clubIds.push(c.clubId);
          totals.set(c.memberId, row);
        }
        rows = [...totals.values()].sort((a, b) => byCount(a, b) || a.memberId.localeCompare(b.memberId));
      }
      return withRanks(rows, (a, b) => a.contributions === b.contributions && a.points === b.points);
    },
    async universityTotals() {
      let rows;
      if (db) rows = await db.collection('contributions').aggregate(universityTotalsPipeline()).toArray();
      else {
        const approved = await list('contributions', { status: 'approved' });
        rows = fixtures.universities.map(u => {
          const mine = approved.filter(c => c.universityId === u.id);
          return { universityId: u.id, name: u.name, contributions: mine.length, points: mine.reduce((s, c) => s + c.points, 0), contributors: new Set(mine.map(c => c.memberId)).size, clubs: new Set(mine.map(c => c.clubId)).size };
        }).filter(r => r.contributions > 0).sort((a, b) => byCount(a, b) || a.universityId.localeCompare(b.universityId));
      }
      return withRanks(rows, (a, b) => a.contributions === b.contributions && a.points === b.points);
    }
  };
}
