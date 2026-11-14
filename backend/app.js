import express from 'express';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { createRepository } from './repositories/records.js';
import { createWorkspace } from './services/workspace.js';
import { readRoutes } from './routes/read.js';
import { plannedRoutes } from './routes/planned.js';
import { atheneRoutes } from './athene/routes.js';
export function createApp({ config, db = null, athene = {} }) {
  if (config.DATA_MODE === 'atlas' && !db) throw new Error('Atlas mode requires a connected database.');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  const repository = createRepository(db);
  const workspace = createWorkspace(repository);
  const send = (res, data) => res.json({ data, meta: { mode: config.DATA_MODE, fictional: config.DATA_MODE === 'demo', foundation: true } });
  app.get('/api/health', async (req, res, next) => {
    try {
      if (db) await db.command({ ping: 1 });
      send(res, { status: 'ok', database: db ? 'connected' : 'disabled', ai: config.AI_MODE, authentication: 'not-implemented' });
    } catch { next(Object.assign(new Error('Database unavailable; no fallback was used.'), { status: 503, code: 'DATABASE_UNAVAILABLE' })); }
  });
  app.use('/api', readRoutes({ repository, workspace, send, config }));
  app.use('/api/projects/:projectId/athene', atheneRoutes({ db, config, ...athene }));
  app.use('/api', plannedRoutes());
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } }));
  app.use(express.static(fileURLToPath(new URL('../frontend', import.meta.url))));
  app.use((error, req, res, next) => {
    const status = error instanceof ZodError ? 400 : error.status || 500;
    res.status(status).json({ error: { code: error instanceof ZodError ? 'VALIDATION_ERROR' : error.code || (status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR'), message: status >= 500 && status !== 503 ? 'Request failed. No demo fallback was used.' : error.message } });
  });
  return app;
}
