import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { httpError } from '../services/workspace.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const createClubInput = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().max(500).default('')
}).strict();
const createRoleInput = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(800),
  skills: z.array(z.string().trim().min(2).max(60)).max(12).default([])
}).strict();

export function organizationRoutes({ db, send }) {
  const router = Router();
  const memberFor = req => db.collection('members').findOne({ id: req.memberId });
  async function officer(req, clubId) {
    const [club, actor] = await Promise.all([
      db.collection('clubs').findOne({ id: clubId }),
      memberFor(req)
    ]);
    if (!club || !actor?.clubIds?.includes(clubId)) throw httpError(404, 'NOT_FOUND', 'Club not found or inaccessible.');
    if (!club.officerIds?.includes(actor.id)) throw httpError(403, 'OFFICER_REQUIRED', 'Only this club’s officers can manage these records.');
    return { club, actor };
  }
  router.post('/', async (req, res) => {
    const input = createClubInput.parse(req.body);
    const actor = await memberFor(req);
    if (!actor || !actor.universityId || !actor.universityName) throw httpError(403, 'ACADEMIC_PROFILE_REQUIRED', 'Complete your academic profile first.');
    // User-created clubs are explicitly unverified. Do not imply endorsement by a university.
    const university = {
      id: actor.universityId, name: actor.universityName, timezone: 'UTC',
      semesterStart: new Date().toISOString().slice(0, 7) + '-01',
      registeredByMember: actor.id, verified: false
    };
    await db.collection('universities').updateOne(
      { id: university.id }, { $setOnInsert: university }, { upsert: true }
    );
    const now = new Date().toISOString();
    const club = {
      id: `club-${randomUUID()}`, name: input.name, project: input.description,
      universityId: university.id, officerIds: [actor.id], ownerId: actor.id,
      verified: false, category: 'Student organization', createdAt: now
    };
    await db.collection('clubs').insertOne(club);
    await Promise.all([
      db.collection('members').updateOne({ id: actor.id }, { $addToSet: { clubIds: club.id } }),
      db.collection('userProfiles').updateOne({ internalMemberId: actor.id }, { $addToSet: { clubIds: club.id } })
    ]);
    res.status(201);
    send(res, { club, isOfficer: true });
  });

  router.get('/invitations', async (req, res) => {
    send(res, await db.collection('clubInvitations').find(
      { invitedMemberId: req.memberId, status: 'pending' },
      { projection: { _id: 0 } }
    ).sort({ createdAt: -1 }).limit(30).toArray());
  });
  router.post('/invitations/:inviteId/respond', async (req, res) => {
    const inviteId = id.parse(req.params.inviteId);
    const action = z.object({ action: z.enum(['accept', 'decline']) }).strict().parse(req.body).action;
    const invitation = await db.collection('clubInvitations').findOne({
      id: inviteId, invitedMemberId: req.memberId, status: 'pending'
    });
    if (!invitation) throw httpError(404, 'INVITATION_NOT_FOUND', 'Invitation not found or already handled.');
    const actor = await memberFor(req);
    if (!actor || actor.universityId !== invitation.universityId) throw httpError(403, 'UNIVERSITY_MISMATCH', 'The invitation belongs to a different university.');
    const result = await db.collection('clubInvitations').updateOne(
      { id: inviteId, invitedMemberId: req.memberId, status: 'pending' },
      { $set: { status: action === 'accept' ? 'accepted' : 'declined', respondedAt: new Date().toISOString() } }
    );
    if (!result.modifiedCount) throw httpError(409, 'INVITATION_ALREADY_HANDLED', 'This invitation was handled in another session.');
    if (action === 'accept') {
      await Promise.all([
        db.collection('members').updateOne({ id: actor.id }, { $addToSet: { clubIds: invitation.clubId } }),
        db.collection('userProfiles').updateOne({ internalMemberId: actor.id }, { $addToSet: { clubIds: invitation.clubId } })
      ]);
    }
    send(res, { status: action === 'accept' ? 'accepted' : 'declined', clubId: invitation.clubId });
  });
  router.post('/:clubId/invitations', async (req, res) => {
    const clubId = id.parse(req.params.clubId);
    const { club, actor } = await officer(req, clubId);
    const { memberId } = z.object({ memberId: id }).strict().parse(req.body);
    if (memberId === actor.id) throw httpError(400, 'INVITE_SELF', 'You are already a club officer.');
    const target = await db.collection('members').findOne({ id: memberId });
    if (!target || target.universityId !== club.universityId) throw httpError(404, 'MEMBER_NOT_FOUND', 'No eligible student with this member ID at your university.');
    if (target.clubIds?.includes(clubId)) throw httpError(409, 'ALREADY_MEMBER', 'The student is already in your club.');
    const existing = await db.collection('clubInvitations').findOne({ clubId, invitedMemberId: memberId, status: 'pending' });
    if (existing) return send(res, { invitation: { ...existing, _id: undefined } });
    const invite = {
      id: `invite-${randomUUID()}`, clubId, clubName: club.name,
      universityId: club.universityId, invitedMemberId: memberId,
      invitedBy: actor.id, status: 'pending', createdAt: new Date().toISOString()
    };
    await db.collection('clubInvitations').insertOne(invite);
    res.status(201); send(res, { invitation: invite });
  });

  router.get('/:clubId/roster-stats', async (req, res) => {
    const clubId = id.parse(req.params.clubId);
    const actor = await memberFor(req);
    if (!actor?.clubIds?.includes(clubId)) throw httpError(404, 'NOT_FOUND', 'Club inaccessible.');
    const [club, members, contributions, attendance] = await Promise.all([
      db.collection('clubs').findOne({ id: clubId }),
      db.collection('members').find({ clubIds: clubId }).toArray(),
      db.collection('contributions').find({ clubId, status: 'approved' }).toArray(),
      db.collection('attendance').find({ clubId }).toArray()
    ]);
    if (!club) throw httpError(404, 'NOT_FOUND', 'Club unavailable.');
    const rows = members.map(member => {
      const approved = contributions.filter(c => c.memberId === member.id);
      const visits = attendance.filter(a => a.memberId === member.id);
      return {
        id: member.id, name: member.name, major: member.major, year: member.year,
        officer: club.officerIds.includes(member.id),
        contributions: approved.length, sessions: visits.length,
        contributionPoints: approved.reduce((sum, c) => sum + c.points, 0),
        attendancePoints: visits.reduce((sum, a) => sum + a.points, 0),
        points: [...approved, ...visits].reduce((sum, e) => sum + e.points, 0),
        skills: [...new Set(approved.flatMap(c => c.skills || []))],
      };
    }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    send(res, { club: { id: club.id, name: club.name }, members: rows, caveat: 'Activity totals reflect approved records and attendance, not engineering ability.' });
  });

  router.get('/:clubId/succession', async (req, res) => {
    const clubId = id.parse(req.params.clubId);
    const { club } = await officer(req, clubId);
    const [roles, members, contributions] = await Promise.all([
      db.collection('successionRoles').find({ clubId }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
      db.collection('members').find({ clubIds: clubId }).toArray(),
      db.collection('contributions').find({ clubId, status: 'approved' }).toArray()
    ]);
    const candidates = members.map(m => {
      const records = contributions.filter(c => c.memberId === m.id);
      return {
        memberId: m.id, name: m.name, major: m.major, officer: club.officerIds.includes(m.id),
        contributions: records.length, points: records.reduce((sum, c) => sum + c.points, 0),
        evidencedSkills: [...new Set(records.flatMap(c => c.skills || []))],
      };
    });
    send(res, {
      club: { id: club.id, name: club.name }, roles: roles.map(role => ({
        ...role,
        candidates: candidates.map(c => ({
          ...c, matchingSkills: role.skills.filter(skill => c.evidencedSkills.some(s => s.toLowerCase() === skill.toLowerCase()))
        })).sort((a, b) => b.matchingSkills.length - a.matchingSkills.length || b.contributions - a.contributions || a.name.localeCompare(b.name))
      })),
      caveat: 'Evidence-based skill matching is not a leadership or ability prediction. An officer must review each nomination; no role or permission is assigned automatically.'
    });
  });
  router.post('/:clubId/succession', async (req, res) => {
    const clubId = id.parse(req.params.clubId);
    const { actor } = await officer(req, clubId);
    const input = createRoleInput.parse(req.body);
    const role = {
      id: `role-${randomUUID()}`, clubId, ...input,
      nominations: [], createdBy: actor.id, createdAt: new Date().toISOString()
    };
    await db.collection('successionRoles').insertOne(role);
    res.status(201); send(res, { role });
  });
  router.post('/:clubId/succession/:roleId/nominate', async (req, res) => {
    const clubId = id.parse(req.params.clubId);
    const roleId = id.parse(req.params.roleId);
    const { actor } = await officer(req, clubId);
    const { memberId } = z.object({ memberId: id }).strict().parse(req.body);
    const candidate = await db.collection('members').findOne({ id: memberId, clubIds: clubId });
    const role = await db.collection('successionRoles').findOne({ id: roleId, clubId });
    if (!candidate || !role) throw httpError(404, 'NOT_FOUND', 'Role or candidate is unavailable.');
    if (role.nominations?.some(n => n.memberId === memberId)) throw httpError(409, 'ALREADY_NOMINATED', 'Candidate already nominated.');
    const nomination = { memberId, nominatedBy: actor.id, createdAt: new Date().toISOString(), status: 'proposed' };
    await db.collection('successionRoles').updateOne({ id: roleId, clubId, 'nominations.memberId': { $ne: memberId } }, { $push: { nominations: nomination } });
    send(res, { nomination, caveat: 'Nomination proposed; no officer privileges have been granted.' });
  });
  return router;
}
