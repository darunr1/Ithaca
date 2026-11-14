import { randomUUID } from 'node:crypto';
import { semesterOf, weekStart } from './scoring.js';
export function httpError(status, code, message) { return Object.assign(new Error(message), { status, code }); }
// Group dated entries into academic semesters, newest first.
function bySemester(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const { key, label } = semesterOf(entry.date);
    if (!groups.has(key)) groups.set(key, { key, label, entries: [] });
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key, undefined, { numeric: true }));
}
export function createWorkspace(repository) {
  const requireRecord = async (collection, id) => {
    const record = await repository.one(collection, id);
    if (!record) throw httpError(404, 'NOT_FOUND', 'Record not found.');
    return record;
  };
  const publicMember = ({ id, name, major, year, skills, universityId, clubIds }) => ({ id, name, major, year, skills, universityId, clubIds });
  const localToday = timezone => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  return {
    requireRecord,
    // Demo identity assertion from the X-Demo-Member header. NOT authentication.
    async actor(memberId) {
      if (!memberId) throw httpError(401, 'IDENTITY_REQUIRED', 'Choose a demo identity first (X-Demo-Member header).');
      const member = await repository.one('members', memberId);
      if (!member) throw httpError(401, 'IDENTITY_REQUIRED', 'Unknown demo identity.');
      return member;
    },
    async roster(clubId) { await requireRecord('clubs', clubId); return repository.list('members', { clubIds: clubId }); },
    async profile(memberId) {
      const member = await requireRecord('members', memberId);
      const [contributions, attendance] = await Promise.all([repository.history(memberId), repository.list('attendance', { memberId })]);
      const skillCounts = new Map();
      for (const c of contributions) for (const s of c.skills) skillCounts.set(s, (skillCounts.get(s) || 0) + 1);
      const clubs = await Promise.all(member.clubIds.map(async clubId => {
        const club = await repository.one('clubs', clubId);
        if (!club) return null;
        const rows = await repository.rankings(clubId, '0000-01-01');
        const row = rows.find(r => r.memberId === memberId);
        return { clubId, name: club.name, officer: club.officerIds.includes(memberId), rank: row?.rank ?? null, of: rows.length, points: row?.points ?? 0 };
      }));
      const university = await repository.one('universities', member.universityId);
      const contributionPoints = contributions.reduce((s, c) => s + c.points, 0);
      const attendancePoints = attendance.reduce((s, a) => s + a.points, 0);
      const stats = {
        totalPoints: contributionPoints + attendancePoints,
        contributionCount: contributions.length, contributionPoints,
        attendanceCount: attendance.length, attendancePoints,
        universityName: university?.name ?? null,
        clubs: clubs.filter(Boolean),
        skills: [...skillCounts].map(([skill, count]) => ({ skill, count })).sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill)),
        semesters: bySemester([...contributions.map(c => ({ ...c, kind: 'contribution' })), ...attendance.map(a => ({ ...a, kind: 'attendance' }))]).map(({ key, label, entries }) => {
          const done = entries.filter(e => e.kind === 'contribution'), present = entries.filter(e => e.kind === 'attendance');
          return { key, label, contributions: done.length, attendance: present.length, points: entries.reduce((s, e) => s + e.points, 0) };
        })
      };
      return { member, contributions, attendance, stats };
    },
    async rankings(clubId, range, asOf) {
      const club = await requireRecord('clubs', clubId);
      const university = await requireRecord('universities', club.universityId);
      // Demo uses a fixed story date; Atlas uses the current university-local date.
      const today = asOf || localToday(university.timezone);
      const start = range === 'week' ? weekStart(today) : range === 'semester' ? university.semesterStart : '0000-01-01';
      return { range, start, rows: await repository.rankings(clubId, start), caveat: 'Activity within this club; not a measure of engineering ability.' };
    },
    // Officer-only: approved contributions for one club, grouped by semester.
    async semesters(clubId, actor) {
      const club = await requireRecord('clubs', clubId);
      if (!club.officerIds.includes(actor.id)) throw httpError(403, 'OFFICER_REQUIRED', 'Only club officers can view semester-by-semester contributions.');
      const [approved, members, pending] = await Promise.all([repository.list('contributions', { clubId, status: 'approved' }), repository.list('members', { clubIds: clubId }), repository.list('drafts', { clubId, status: 'pending' })]);
      const nameOf = id => members.find(m => m.id === id)?.name ?? id;
      const semesters = bySemester(approved).map(({ key, label, entries }) => {
        const perMember = new Map();
        for (const c of entries) {
          const row = perMember.get(c.memberId) || { memberId: c.memberId, name: nameOf(c.memberId), contributions: 0, points: 0 };
          row.contributions += 1; row.points += c.points;
          perMember.set(c.memberId, row);
        }
        return {
          key, label, contributions: entries.length, points: entries.reduce((s, c) => s + c.points, 0), contributors: perMember.size,
          members: [...perMember.values()].sort((a, b) => b.contributions - a.contributions || b.points - a.points || a.name.localeCompare(b.name)),
          entries: entries.sort((a, b) => b.date.localeCompare(a.date)).map(c => ({ id: c.id, memberId: c.memberId, name: nameOf(c.memberId), date: c.date, description: c.description, skills: c.skills, level: c.level, points: c.points }))
        };
      });
      return { clubId, clubName: club.name, pendingRequests: pending.filter(d => d.origin === 'member-request').length, semesters };
    },
    // Members request credit for their own work; requests become pending drafts and award no points.
    async requestContribution(clubId, actor, input) {
      const club = await requireRecord('clubs', clubId);
      if (!actor.clubIds.includes(clubId)) throw httpError(403, 'MEMBERSHIP_REQUIRED', 'Only members of this club can request contribution credit.');
      if (club.officerIds.includes(actor.id)) throw httpError(403, 'MEMBER_REQUEST_ONLY', 'Officers record contributions through officer review, not member requests.');
      const university = await requireRecord('universities', club.universityId);
      if (input.date > localToday(university.timezone)) throw httpError(400, 'VALIDATION_ERROR', 'Contribution date cannot be in the future.');
      const id = `request-${randomUUID()}`;
      const draft = {
        id, clubId, memberId: actor.id, requestedBy: actor.id, origin: 'member-request', status: 'pending',
        date: input.date, week: weekStart(input.date), description: input.description, skills: input.skills, suggestedLevel: input.suggestedLevel,
        source: { id: `${id}-evidence`, title: 'Member-submitted evidence', excerpt: input.evidence, memberSubmitted: true },
        createdAt: new Date().toISOString()
      };
      return repository.insert('drafts', draft);
    },
    async myRequests(clubId, actor) {
      await requireRecord('clubs', clubId);
      return (await repository.list('drafts', { clubId, memberId: actor.id })).filter(d => d.origin === 'member-request').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },
    async universityLeaderboard(universityId) {
      const university = await requireRecord('universities', universityId);
      const [rows, clubs] = await Promise.all([repository.universityContributors(universityId), repository.list('clubs', { universityId })]);
      return {
        university: { id: university.id, name: university.name },
        rows: rows.map(r => ({ ...r, clubs: r.clubIds.map(id => clubs.find(c => c.id === id)?.name ?? id) })),
        caveat: 'Counts officer-approved contributions only; not a measure of engineering ability.'
      };
    },
    async universityTotals() { return repository.universityTotals(); },
    async discovery({ clubId, skill, memberId } = {}) {
      const members = await repository.list('members', { visibleToCompanies: true });
      const profiles = [];
      for (const member of members) {
        if (memberId && member.id !== memberId) continue;
        if (clubId && !member.clubIds.includes(clubId)) continue;
        const contributions = await repository.history(member.id);
        if (skill && !contributions.some(c => c.skills.some(s => s.toLowerCase().includes(skill.toLowerCase())))) continue;
        profiles.push({ member: publicMember(member), contributions });
      }
      return profiles;
    }
  };
}
