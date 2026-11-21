import { randomUUID } from 'node:crypto';
import { contributionPoints, parseTerm, semesterOf, termsThrough, weekStart } from './scoring.js';
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
export function createWorkspace(repository, colleges = null, catalog = null) {
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
    async roster(clubId, { limited = false } = {}) {
      await requireRecord('clubs', clubId);
      const members = await repository.list('members', { clubIds: clubId });
      // Live rosters must not disclose email, consent flags or other club memberships.
      return limited ? members.map(({ id, name, major, year, skills, universityId }) => ({
        id, name, major, year, skills, universityId, clubIds: [clubId]
      })) : members;
    },
    async profile(memberId, { visibleClubIds = null } = {}) {
      const member = await requireRecord('members', memberId);
      const [history, visits] = await Promise.all([repository.history(memberId), repository.list('attendance', { memberId })]);
      const allowed = record => !visibleClubIds || visibleClubIds.includes(record.clubId);
      const contributions = history.filter(allowed);
      const attendance = visits.filter(allowed);
      const visibleMember = visibleClubIds
        ? { ...publicMember(member), clubIds: member.clubIds.filter(id => visibleClubIds.includes(id)) }
        : member;
      const skillCounts = new Map();
      for (const c of contributions) for (const s of c.skills) skillCounts.set(s, (skillCounts.get(s) || 0) + 1);
      const clubs = await Promise.all(visibleMember.clubIds.map(async clubId => {
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
      return { member: visibleMember, contributions, attendance, stats };
    },
    async rankings(clubId, range, asOf) {
      const club = await requireRecord('clubs', clubId);
      const university = await requireRecord('universities', club.universityId);
      // Demo uses a fixed story date; Atlas uses the current university-local date.
      const today = asOf || localToday(university.timezone);
      const term = parseTerm(range);
      const start = term ? term.start : range === 'week' ? weekStart(today) : range === 'semester' ? university.semesterStart : '0000-01-01';
      const end = term ? term.end : '9999-12-31';
      const terms = termsThrough(today).map(({ id, label }) => ({ id, label }));
      return { range, start, end, terms, rows: await repository.rankings(clubId, start, end), caveat: 'Activity within this club; not a measure of engineering ability.' };
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
      const requests = pending.filter(d => d.origin === 'member-request')
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .map(d => ({ id: d.id, memberId: d.memberId, name: nameOf(d.memberId), date: d.date, description: d.description, skills: d.skills ?? [], suggestedLevel: d.suggestedLevel, evidence: d.source?.excerpt ?? '', createdAt: d.createdAt ?? null }));
      return { clubId, clubName: club.name, pendingRequests: requests.length, requests, semesters };
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
    // Officer review of a member request: approve (preset level or custom points) or delete.
    // Order: validate, claim the pending draft (so only one review wins), then write contribution + audit.
    // NOTE: not a multi-document transaction yet; Atlas should wrap these writes in a session transaction.
    async reviewRequest(requestId, actor, { action, level, customPoints, reason }) {
      const draft = await repository.one('drafts', requestId);
      if (!draft || draft.origin !== 'member-request') throw httpError(404, 'NOT_FOUND', 'Request not found.');
      const club = await requireRecord('clubs', draft.clubId);
      if (!club.officerIds.includes(actor.id)) throw httpError(403, 'OFFICER_REQUIRED', 'Only officers of this club can review its requests.');
      if (draft.memberId === actor.id) throw httpError(403, 'SELF_REVIEW', 'A different officer must review your own request.');
      if (draft.status !== 'pending') throw httpError(409, 'ALREADY_REVIEWED', `This request was already ${draft.status}.`);
      const now = new Date().toISOString();
      if (action === 'delete') {
        const claimed = await repository.claim('drafts', { id: requestId, status: 'pending' }, { status: 'rejected', reviewedBy: actor.id, reviewedAt: now, ...(reason ? { reviewNote: reason } : {}) });
        if (!claimed) throw httpError(409, 'ALREADY_REVIEWED', 'This request was already reviewed.');
        await repository.insert('auditLogs', { id: `audit-${randomUUID()}`, entryId: requestId, action: 'delete', before: draft, after: claimed, reviewerId: actor.id, createdAt: now });
        return { request: claimed, contribution: null };
      }
      let points;
      try { points = contributionPoints(level, customPoints); } catch (error) { throw httpError(400, 'VALIDATION_ERROR', error.message); }
      const contributionId = `contribution-${randomUUID()}`;
      const claimed = await repository.claim('drafts', { id: requestId, status: 'pending' }, { status: 'approved', reviewedBy: actor.id, reviewedAt: now, contributionId });
      if (!claimed) throw httpError(409, 'ALREADY_REVIEWED', 'This request was already reviewed.');
      const contribution = {
        id: contributionId, clubId: club.id, universityId: club.universityId, memberId: draft.memberId, requestId,
        date: draft.date, week: draft.week, description: draft.description, skills: draft.skills ?? [], level, points,
        status: 'approved', approvedBy: actor.id,
        source: { id: draft.source.id, title: draft.source.title || 'Member-submitted evidence', excerpt: draft.source.excerpt, memberSubmitted: true },
        createdAt: now
      };
      await repository.insert('contributions', contribution);
      await repository.insert('auditLogs', { id: `audit-${randomUUID()}`, entryId: contributionId, action: 'approve', before: draft, after: contribution, reviewerId: actor.id, createdAt: now });
      return { request: claimed, contribution };
    },
    // Officer rejects an already-approved contribution. Soft delete: status becomes 'deleted' (dropped from all
    // rankings/stats, which only count 'approved'), and the audit log keeps the before/after record.
    async rejectContribution(contributionId, actor, { reason } = {}) {
      const contribution = await repository.one('contributions', contributionId);
      if (!contribution) throw httpError(404, 'NOT_FOUND', 'Contribution not found.');
      const club = await requireRecord('clubs', contribution.clubId);
      if (!club.officerIds.includes(actor.id)) throw httpError(403, 'OFFICER_REQUIRED', 'Only officers of this club can reject its contributions.');
      if (contribution.memberId === actor.id) throw httpError(403, 'SELF_REVIEW', 'A different officer must review your own contribution.');
      if (contribution.status !== 'approved') throw httpError(409, 'ALREADY_REVIEWED', 'This contribution was already rejected.');
      const now = new Date().toISOString();
      const rejected = await repository.claim('contributions', { id: contributionId, status: 'approved' }, { status: 'deleted', deletedBy: actor.id, deletedAt: now, ...(reason ? { deleteReason: reason } : {}) });
      if (!rejected) throw httpError(409, 'ALREADY_REVIEWED', 'This contribution was already rejected.');
      if (contribution.requestId) await repository.claim('drafts', { id: contribution.requestId }, { contributionRejected: true, contributionRejectedAt: now });
      await repository.insert('auditLogs', { id: `audit-${randomUUID()}`, entryId: contributionId, action: 'delete', before: contribution, after: rejected, reviewerId: actor.id, createdAt: now });
      return rejected;
    },
    async myRequests(clubId, actor) {
      await requireRecord('clubs', clubId);
      return (await repository.list('drafts', { clubId, memberId: actor.id })).filter(d => d.origin === 'member-request').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },
    async searchColleges(query) {
      if (!colleges) return [];
      return colleges.search(query, { registered: await repository.list('universities') });
    },
    async universityLeaderboard(universityId) {
      const university = await repository.one('universities', universityId);
      if (!university) {
        // A directory college with no Ithaca clubs yet: a real, empty leaderboard rather than a 404.
        const college = colleges?.get(universityId);
        if (!college) throw httpError(404, 'NOT_FOUND', 'Record not found.');
        return { university: { id: college.id, name: college.name, location: [college.state, college.country].filter(Boolean).join(', ') || null, registered: false }, rows: [], caveat: 'No clubs from this college are on Ithaca yet.' };
      }
      const [rows, clubs] = await Promise.all([repository.universityContributors(universityId), repository.list('clubs', { universityId })]);
      return {
        university: { id: university.id, name: university.name, registered: true },
        rows: rows.map(r => ({ ...r, clubs: r.clubIds.map(id => clubs.find(c => c.id === id)?.name ?? id) })),
        caveat: 'Counts officer-approved contributions only; not a measure of engineering ability.'
      };
    },
    async universityTotals() { return repository.universityTotals(); },
    leaderboardFilters() {
      return { organizations: catalog?.organizations ?? [], majors: catalog?.majors ?? [] };
    },
    // Most contributions, filtered by any combination of college, national organization (club type) and major.
    async leaderboard({ universityId, organization, major } = {}) {
      if (organization && catalog && !catalog.hasOrganization(organization)) throw httpError(400, 'VALIDATION_ERROR', 'Unknown organization.');
      if (major && catalog && !catalog.hasMajor(major)) throw httpError(400, 'VALIDATION_ERROR', 'Unknown major.');
      let university = null;
      if (universityId) {
        const registered = await repository.one('universities', universityId);
        if (registered) university = { id: registered.id, name: registered.name, registered: true };
        else {
          const college = colleges?.get(universityId);
          if (!college) throw httpError(404, 'NOT_FOUND', 'Record not found.');
          university = { id: college.id, name: college.name, location: [college.state, college.country].filter(Boolean).join(', ') || null, registered: false };
        }
      }
      const filters = { university, organization: organization ? catalog?.organizations.find(o => o.acronym === organization) ?? { acronym: organization } : null, major: major || null };
      if (university && !university.registered) return { filters, rows: [], caveat: `No clubs from ${university.name} are on Ithaca yet.` };
      const [clubs, universities] = await Promise.all([repository.list('clubs'), repository.list('universities')]);
      const clubIds = organization ? clubs.filter(c => c.organization === organization).map(c => c.id) : undefined;
      const rows = clubIds && !clubIds.length ? [] : await repository.filteredContributors({ universityId: university?.id, clubIds, major: major || undefined });
      return {
        filters,
        rows: rows.map(r => ({ ...r, universityName: universities.find(u => u.id === r.universityId)?.name ?? null, clubs: r.clubIds.map(id => clubs.find(c => c.id === id)?.name ?? id) })),
        caveat: 'Counts officer-approved contributions only; not a measure of engineering ability.'
      };
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
