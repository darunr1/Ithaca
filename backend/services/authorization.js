import { requireVerifiedMemberId } from '../auth/identity.js';
import { httpError } from './workspace.js';

const hidden = () => httpError(404, 'NOT_FOUND', 'Club or record not found or inaccessible.');
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

// A fresh member and club lookup is mandatory for each sensitive operation.
// userProfiles.clubIds is a UI convenience, never an authorization grant.
export async function requireClubMember(req, db, clubId) {
  const memberId = requireVerifiedMemberId(req);
  if (!validId(clubId)) throw hidden();
  const [actor, club] = await Promise.all([
    db.collection('members').findOne({ id: memberId }),
    db.collection('clubs').findOne({ id: clubId })
  ]);
  if (!actor || !club || !actor.clubIds?.includes(clubId) ||
      actor.universityId !== club.universityId ||
      (actor.supabaseUserId && actor.supabaseUserId !== req.authProfile.authProviderUserId)) throw hidden();
  return { actor, club, clubId };
}

export async function requireOfficer(req, db, clubId) {
  const access = await requireClubMember(req, db, clubId);
  if (!access.club.officerIds?.includes(access.actor.id) && access.club.ownerId !== access.actor.id) {
    throw httpError(403, 'OFFICER_REQUIRED', 'Only officers of this club may perform this action.');
  }
  return { ...access, isOfficer: true };
}

// A project lead is only privileged in the project that names that member.
// Officers may manage projects without appearing in each project's leadIds.
export async function requireProjectLead(req, db, clubId, projectId) {
  const access = await requireClubMember(req, db, clubId);
  if (!validId(projectId)) throw hidden();
  const project = await db.collection('clubProjects').findOne({ id: projectId, clubId });
  if (!project) throw hidden();
  const isOfficer = access.club.officerIds?.includes(access.actor.id) || access.club.ownerId === access.actor.id;
  const isProjectLead = project.leadIds?.includes(access.actor.id) || false;
  if (!isOfficer && !isProjectLead) {
    throw httpError(403, 'PROJECT_LEAD_REQUIRED', 'Only club officers or this project’s leads may manage it.');
  }
  return { ...access, project, isOfficer: Boolean(isOfficer), isProjectLead };
}
