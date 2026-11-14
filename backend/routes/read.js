import { Router } from 'express';
import { z } from 'zod';
import { httpError } from '../services/workspace.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export function readRoutes({ repository, workspace, send, config }) {
  const router = Router();
  router.get('/clubs', async (req, res) => send(res, await repository.list('clubs')));
  router.get('/clubs/:id/roster', async (req, res) => send(res, await workspace.roster(id.parse(req.params.id))));
  router.get('/clubs/:id/sessions', async (req, res) => { await workspace.requireRecord('clubs', id.parse(req.params.id)); send(res, await repository.list('sessions', { clubId: req.params.id })); });
  router.get('/clubs/:id/drafts', async (req, res) => { await workspace.requireRecord('clubs', id.parse(req.params.id)); send(res, await repository.list('drafts', { clubId: req.params.id })); });
  router.get('/members/:id', async (req, res) => send(res, await workspace.profile(id.parse(req.params.id))));
  router.get('/clubs/:id/rankings', async (req, res) => {
    const range = z.enum(['week', 'semester', 'all']).parse(req.query.range ?? 'all');
    send(res, await workspace.rankings(id.parse(req.params.id), range, config.DATA_MODE === 'demo' ? '2026-11-14' : undefined));
  });
  router.get('/recruiter/profiles', async (req, res) => {
    const query = z.object({ clubId: id.optional(), skill: z.string().max(80).optional() }).strict().parse(req.query);
    send(res, await workspace.discovery(query));
  });
  router.get('/recruiter/profiles/:id', async (req, res) => {
    const profiles = await workspace.discovery({ memberId: id.parse(req.params.id) });
    if (!profiles.length) throw httpError(404, 'NOT_FOUND', 'Profile not found.');
    send(res, profiles[0]);
  });
  return router;
}
