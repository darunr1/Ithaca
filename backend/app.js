import express from 'express';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { createRepository } from './repositories/records.js';
import { createWorkspace } from './services/workspace.js';
import { readRoutes } from './routes/read.js';
import { plannedRoutes } from './routes/planned.js';
import { organizationRoutes } from './routes/organizations.js';
import { projectRoutes } from './routes/projects.js';
import { atheneRoutes } from './athene/routes.js';
import { ledgerRoutes } from './routes/ledger.js';
import { createCollegeDirectory } from './services/colleges.js';
import { createCatalog } from './services/catalog.js';
import { athenaSessionRoutes } from './athene/session.js';
import { authRoutes, supabaseIdentity } from './auth/supabase.js';
import { fail } from './athene/errors.js';
import { createGeminiService } from '../ai-service/gemini.js';
export function createApp({ config, db = null, athene = {}, authentication = {}, ai }) {
  // Resume skills use Gemini when it is configured; without a key the feature is simply off.
  if (ai === undefined) ai = config.AI_MODE === 'live' && !config.GEMINI_API_KEY ? null : createGeminiService(config);
  if (config.DATA_MODE === 'atlas' && !db) throw new Error('Atlas mode requires a connected database.');
  const app = express();
  const frontend = fileURLToPath(new URL('../frontend', import.meta.url));
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  const repository = createRepository(db);
  const collegeDirectory = createCollegeDirectory();
  const workspace = createWorkspace(repository, collegeDirectory, createCatalog());
  const send = (res, data) => res.json({ data, meta: { mode: config.DATA_MODE, fictional: config.DATA_MODE === 'demo', foundation: true } });
  app.get('/api/health', async (req, res, next) => {
    try {
      if (db) await db.command({ ping: 1 });
      send(res, { status: 'ok', database: db ? 'connected' : 'disabled', ai: config.AI_MODE, authentication: config.AUTH_MODE === 'supabase' ? 'supabase' : 'fictional-demo' });
    } catch { next(Object.assign(new Error('Database unavailable; no fallback was used.'), { status: 503, code: 'DATABASE_UNAVAILABLE' })); }
  });
  app.use('/api/auth', authRoutes({ config, db, verify: authentication.verify, directory: collegeDirectory, ai }));
  app.post('/api/athena-dev-session', (req, res, next) => {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!config.ATHENE_ENABLED || !config.ATHENE_DEV_TOKEN || config.NODE_ENV === 'production' || !local) return next(Object.assign(new Error('Development session is unavailable.'), { status: 404, code: 'NOT_FOUND' }));
    res.setHeader('Set-Cookie', `athena_dev_session=${encodeURIComponent(config.ATHENE_DEV_TOKEN)}; HttpOnly; SameSite=Lax; Path=/api/projects`);
    res.json({ data: { memberId: config.ATHENE_DEV_MEMBER_ID }, meta: { feature: 'athena', developmentOnly: true } });
  });
  if (config.AUTH_MODE !== 'supabase') app.use('/api/athena-session', athenaSessionRoutes({ config, db }));
  app.use('/api', supabaseIdentity({ config, db, verify: authentication.verify }));
  if (config.AUTH_MODE === 'supabase') {
    app.use('/api/organizations', projectRoutes({ db, send }));
    app.use('/api/organizations', organizationRoutes({ db, send }));
  }
  app.use('/api', readRoutes({ repository, workspace, send, config }));
  const authenticate = config.AUTH_MODE === 'supabase' ? async req => req.memberId || Promise.reject(fail(401, 'UNAUTHENTICATED', 'Sign in to continue.')) : athene.authenticate;
  app.use('/api/projects/:projectId/athene', atheneRoutes({ db, config, ...athene, authenticate }));
  app.use('/api', ledgerRoutes({ workspace, send, config }));
  app.use('/api', plannedRoutes());
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } }));
  for (const [route, file] of [['/dashboard', 'app.html'], ['/app', 'app.html'], ['/login', 'login.html'], ['/signup', 'signup.html'], ['/forgot-password', 'forgot-password.html'], ['/reset-password', 'reset-password.html']]) app.get(route, (req, res) => res.sendFile(`${frontend}/${file}`));
  app.use(express.static(frontend));
  app.use((error, req, res, next) => {
    const status = error instanceof ZodError ? 400 : error.status || 500;
    res.status(status).json({ error: { code: error instanceof ZodError ? 'VALIDATION_ERROR' : error.code || (status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR'), message: status >= 500 && status !== 503 ? 'Request failed. No demo fallback was used.' : error instanceof ZodError ? error.issues.map(i => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ') : error.message } });
  });
  return app;
}
