import { Router } from 'express';
import { z } from 'zod';
import { weekStart } from '../services/scoring.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
// Directory college ids are "cb-" + the College Board slug, some of which exceed 80 characters.
const universityId = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { try { weekStart(value); return true; } catch { return false; } }, 'Invalid calendar date.');
const requestBody = z.object({
  description: z.string().trim().min(10).max(2000),
  evidence: z.string().trim().min(1).max(2000),
  skills: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  suggestedLevel: z.enum(['low', 'medium', 'high']),
  date: calendarDate
}).strict();
// Kleos Ledger: member requests, officer semester history, university leaderboards.
// Production identity is verified Supabase auth. X-Demo-Member exists only in explicit fictional demo mode.
export function ledgerRoutes({ workspace, send, config }) {
  const router = Router();
  const actor = req => workspace.actor(config.AUTH_MODE === 'supabase' ? req.memberId : req.get('X-Demo-Member') ? id.parse(req.get('X-Demo-Member')) : null);
  router.get('/clubs/:id/semesters', async (req, res) => send(res, await workspace.semesters(id.parse(req.params.id), await actor(req))));
  router.get('/clubs/:id/contribution-requests', async (req, res) => send(res, await workspace.myRequests(id.parse(req.params.id), await actor(req))));
  router.post('/clubs/:id/contribution-requests', async (req, res) => {
    const clubId = id.parse(req.params.id), member = await actor(req), body = requestBody.parse(req.body ?? {});
    res.status(201);
    send(res, await workspace.requestContribution(clubId, member, body));
  });
  router.post('/contribution-requests/:id/review', async (req, res) => {
    const requestId = id.parse(req.params.id), member = await actor(req);
    const body = z.discriminatedUnion('action', [
      z.object({ action: z.literal('approve'), level: z.enum(['low', 'medium', 'high', 'custom']), customPoints: z.number().int().optional() }).strict(),
      z.object({ action: z.literal('delete'), reason: z.string().trim().max(500).optional() }).strict()
    ]).parse(req.body ?? {});
    send(res, await workspace.reviewRequest(requestId, member, body));
  });
  router.post('/contributions/:id/reject', async (req, res) => {
    const contributionId = id.parse(req.params.id), member = await actor(req);
    const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).strict().parse(req.body ?? {});
    send(res, await workspace.rejectContribution(contributionId, member, { reason }));
  });
  router.get('/universities', async (req, res) => send(res, await workspace.universityTotals()));
  router.get('/universities/:id/leaderboard', async (req, res) => send(res, await workspace.universityLeaderboard(universityId.parse(req.params.id))));
  router.get('/leaderboard/filters', (req, res) => send(res, workspace.leaderboardFilters()));
  router.get('/leaderboard', async (req, res) => {
    const query = z.object({ universityId: universityId.optional(), organization: z.string().trim().max(20).optional(), major: z.string().trim().max(120).optional() }).strict().parse(req.query);
    send(res, await workspace.leaderboard(query));
  });
  router.get('/colleges/search', async (req, res) => {
    const { q } = z.object({ q: z.string().trim().max(120).default('') }).strict().parse(req.query);
    send(res, q ? await workspace.searchColleges(q) : []);
  });
  return router;
}
