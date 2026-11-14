import { Router } from 'express';
// Keep unfinished features unmistakable. Never acknowledge writes that did not persist.
export function plannedRoutes() {
  const router = Router();
  const pending = (req, res) => res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Foundation contract only. See docs/API.md and docs/TEAM.md.' } });
  for (const path of ['/clubs/:id/sessions', '/sessions/:id/attendance', '/clubs/:id/contributions/drafts', '/contributions', '/clubs/:id/applications', '/connections']) router.post(path, pending);
  router.patch('/contributions/:id', pending);
  router.get('/clubs/:id/bow', pending);
  return router;
}
