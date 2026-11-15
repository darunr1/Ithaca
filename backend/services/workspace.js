import { weekStart } from './scoring.js';
export function httpError(status, code, message) { return Object.assign(new Error(message), { status, code }); }
export function createWorkspace(repository) {
  const requireRecord = async (collection, id) => {
    const record = await repository.one(collection, id);
    if (!record) throw httpError(404, 'NOT_FOUND', 'Record not found.');
    return record;
  };
  const publicMember = ({ id, name, major, year, skills, universityId, clubIds }) => ({ id, name, major, year, skills, universityId, clubIds });
  return {
    requireRecord,
    async roster(clubId) { await requireRecord('clubs', clubId); return repository.list('members', { clubIds: clubId }); },
    async profile(memberId) {
      const member = await requireRecord('members', memberId);
      return { member, contributions: await repository.history(memberId), attendance: await repository.list('attendance', { memberId }) };
    },
    async rankings(clubId, range, asOf) {
      const club = await requireRecord('clubs', clubId);
      const university = await requireRecord('universities', club.universityId);
      // Demo uses a fixed story date; Atlas uses the current university-local date.
      const today = asOf || new Intl.DateTimeFormat('en-CA', { timeZone: university.timezone }).format(new Date());
      const start = range === 'week' ? weekStart(today) : range === 'semester' ? university.semesterStart : '0000-01-01';
      return { range, start, rows: await repository.rankings(clubId, start), caveat: 'Activity within this club; not a measure of engineering ability.' };
    },
    async discovery({ clubId, skill, memberId, name, major, university, club, year, state } = {}) {
      const matches = (value, query) => !query || String(value ?? '').toLowerCase().includes(query.trim().toLowerCase());
      const [universities, clubs] = await Promise.all([repository.list('universities'), repository.list('clubs')]);
      const members = await repository.list('members', { visibleToCompanies: true });
      const profiles = [];
      for (const member of members) {
        if (memberId && member.id !== memberId) continue;
        if (clubId && !member.clubIds.includes(clubId)) continue;
        if (!matches(member.name, name) || !matches(member.major, major)) continue;
        if (year && member.year !== year) continue;
        const memberUniversity = universities.find(u => u.id === member.universityId);
        const memberClubs = clubs.filter(c => member.clubIds.includes(c.id));
        if (!matches(memberUniversity?.name, university)) continue;
        if (!matches(memberUniversity?.state, state)) continue;
        if (club && !memberClubs.some(c => matches(c.name, club))) continue;
        const contributions = await repository.history(member.id);
        if (skill && !contributions.some(c => c.skills.some(s => matches(s, skill)))) continue;
        profiles.push({ member: publicMember(member), university: memberUniversity ? { id: memberUniversity.id, name: memberUniversity.name, state: memberUniversity.state ?? null } : null, clubs: memberClubs.map(({ id, name }) => ({ id, name })), contributions });
      }
      return profiles;
    }
  };
}
