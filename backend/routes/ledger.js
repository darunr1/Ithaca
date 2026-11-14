import { Router } from 'express';
import { z } from 'zod';
import { weekStart } from '../services/scoring.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { try { weekStart(value); return true; } catch { return false; } }, 'Invalid calendar date.');
const requestBody = z.object({
  description: z.string().trim().min(10).max(2000),
  evidence: z.string().trim().min(1).max(2000),
  skills: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  suggestedLevel: z.enum(['low', 'medium', 'high']),
  date: calendarDate
}).strict();
// Kleos Ledger: member requests, officer semester history, university leaderboards.
// The acting member comes from the X-Demo-Member header: a demo identity assertion, not authentication.
export function ledgerRoutes({ workspace, send }) {
  const router = Router();
  const actor = req => workspace.actor(req.get('X-Demo-Member') ? id.parse(req.get('X-Demo-Member')) : null);
  router.get('/clubs/:id/semesters', async (req, res) => send(res, await workspace.semesters(id.parse(req.params.id), await actor(req))));
  router.get('/clubs/:id/contribution-requests', async (req, res) => send(res, await workspace.myRequests(id.parse(req.params.id), await actor(req))));
  router.post('/clubs/:id/contribution-requests', async (req, res) => {
    const clubId = id.parse(req.params.id), member = await actor(req), body = requestBody.parse(req.body ?? {});
    res.status(201);
    send(res, await workspace.requestContribution(clubId, member, body));
  });
  router.get('/universities', async (req, res) => send(res, await workspace.universityTotals()));
  router.get('/universities/:id/leaderboard', async (req, res) => send(res, await workspace.universityLeaderboard(id.parse(req.params.id))));
  return router;
}
