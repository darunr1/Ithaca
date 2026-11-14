import { fixtures } from '../../demo-data/fixtures.js';
import { leaderboardPipeline, memberHistoryPipeline } from '../../database/aggregations.js';
export function createRepository(db) {
  async function list(collection, filter = {}) {
    if (db) return db.collection(collection).find(filter, { projection: { _id: 0 } }).toArray();
    return structuredClone(fixtures[collection].filter(record => Object.entries(filter).every(([key, value]) => Array.isArray(record[key]) ? record[key].includes(value) : record[key] === value)));
  }
  async function one(collection, id) { return (await list(collection, { id }))[0] ?? null; }
  return {
    list, one,
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
      let rank = 0;
      return rows.map((row, i) => { if (i === 0 || rows[i - 1].points !== row.points) rank = i + 1; return { ...row, rank }; });
    }
  };
}
