import { Router } from 'express';
import { z } from 'zod';
import { httpError } from '../services/workspace.js';
import { requireVerifiedMemberId } from '../auth/identity.js';
import { requireClubMember, requireOfficer } from '../services/authorization.js';
import { discoveryOptions } from '../services/discovery-options.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export function readRoutes({ repository, workspace, send, config, db }) {
  const router = Router();
  const live = config.AUTH_MODE === 'supabase';
  const clubAccess = (req, clubId) => live ? requireClubMember(req, db, clubId) : Promise.resolve(null);
  const officerAccess = (req, clubId) => live ? requireOfficer(req, db, clubId) : Promise.resolve(null);
  const liveMember = async req => {
    const memberId = requireVerifiedMemberId(req);
    const actor = await db.collection('members').findOne({ id: memberId });
    if (!actor) throw httpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    if (actor.supabaseUserId && actor.supabaseUserId !== req.authProfile.authProviderUserId) throw httpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    return actor;
  };
  router.get('/recruiter/discovery-options', async (req, res) => send(res, await discoveryOptions()));
  router.get('/clubs', async (req, res) => { const clubs = await repository.list('clubs'); if (!live) return send(res, clubs); const actor = await liveMember(req); send(res, clubs.filter(club => actor.clubIds?.includes(club.id) && actor.universityId === club.universityId)); });
  router.get('/clubs/:id/roster', async (req, res) => { const clubId = id.parse(req.params.id); await clubAccess(req, clubId); send(res, await workspace.roster(clubId, { limited: live })); });
  router.get('/clubs/:id/sessions', async (req, res) => { const clubId = id.parse(req.params.id); await clubAccess(req, clubId); await workspace.requireRecord('clubs', clubId); send(res, await repository.list('sessions', { clubId })); });
  router.get('/clubs/:id/drafts', async (req, res) => { const clubId = id.parse(req.params.id); await officerAccess(req, clubId); await workspace.requireRecord('clubs', clubId); send(res, await repository.list('drafts', { clubId })); });
  router.get('/members/:id', async (req, res) => {
    const memberId = id.parse(req.params.id);
    if (!live) return send(res, await workspace.profile(memberId));
    const actor = await liveMember(req);
    if (memberId === actor.id) return send(res, await workspace.profile(memberId));
    const target = await db.collection('members').findOne({ id: memberId });
    if (!target || target.universityId !== actor.universityId) throw httpError(404, 'NOT_FOUND', 'Member not found or inaccessible.');
    const shared = (target.clubIds || []).filter(clubId => actor.clubIds?.includes(clubId));
    const permitted = [];
    for (const clubId of shared) {
      const club = await db.collection('clubs').findOne({ id: clubId });
      if (club?.universityId === actor.universityId) permitted.push(clubId);
    }
    if (!permitted.length) throw httpError(404, 'NOT_FOUND', 'Member not found or inaccessible.');
    send(res, await workspace.profile(memberId, { visibleClubIds: permitted }));
  });
  router.get('/clubs/:id/rankings', async (req, res) => {
    await clubAccess(req, id.parse(req.params.id));
    const range = z.union([z.enum(['week', 'semester', 'all']), z.string().regex(/^\d{4}-(spring|summer|fall|winter)$/)]).parse(req.query.range ?? 'all');
    send(res, await workspace.rankings(id.parse(req.params.id), range, config.DATA_MODE === 'demo' ? '2026-11-14' : undefined));
  });
  router.get('/recruiter/profiles', async (req, res) => {
    const text = z.string().trim().max(80).optional();
    const query = z.object({ clubId: id.optional(), skill: text, name: text, major: text, university: z.string().trim().max(200).optional(), club: text, state: text, year: z.string().regex(/^[1-4]$/).transform(Number).optional() }).strict().parse(req.query);
    send(res, await workspace.discovery(query));
  });
  router.get('/recruiter/profiles/:id', async (req, res) => {
    const profiles = await workspace.discovery({ memberId: id.parse(req.params.id) });
    if (!profiles.length) throw httpError(404, 'NOT_FOUND', 'Profile not found.');
    send(res, profiles[0]);
  });
  return router;
}
