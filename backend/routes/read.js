import { Router } from 'express';
import { z } from 'zod';
import { httpError } from '../services/workspace.js';
import { discoveryOptions } from '../services/discovery-options.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export function readRoutes({ repository, workspace, send, config }) {
  const router = Router();
  const member = req => config.AUTH_MODE === 'clerk' ? workspace.actor(req.memberId) : null;
  const clubAccess = async (req, clubId) => {
    if (config.AUTH_MODE !== 'clerk') return;
    if (!(await member(req)).clubIds.includes(clubId)) throw httpError(404, 'NOT_FOUND', 'Club not found or inaccessible.');
  };
  router.get('/recruiter/discovery-options', async (req, res) => send(res, await discoveryOptions()));
  router.get('/clubs', async (req, res) => { const clubs = await repository.list('clubs'); send(res, config.AUTH_MODE === 'clerk' ? clubs.filter(club => req.authProfile.clubIds.includes(club.id)) : clubs); });
  router.get('/clubs/:id/roster', async (req, res) => { const clubId = id.parse(req.params.id); await clubAccess(req, clubId); send(res, await workspace.roster(clubId)); });
  router.get('/clubs/:id/sessions', async (req, res) => { const clubId = id.parse(req.params.id); await clubAccess(req, clubId); await workspace.requireRecord('clubs', clubId); send(res, await repository.list('sessions', { clubId })); });
  router.get('/clubs/:id/drafts', async (req, res) => { const clubId = id.parse(req.params.id); await clubAccess(req, clubId); await workspace.requireRecord('clubs', clubId); send(res, await repository.list('drafts', { clubId })); });
  router.get('/members/:id', async (req, res) => { const memberId = id.parse(req.params.id); if (config.AUTH_MODE === 'clerk' && memberId !== req.memberId) { const target = await repository.one('members', memberId); if (!target || !target.clubIds.some(clubId => req.authProfile.clubIds.includes(clubId))) throw httpError(404, 'NOT_FOUND', 'Member not found or inaccessible.'); } send(res, await workspace.profile(memberId)); });
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
