import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { createAuthenticator, createSessionCookie } from './auth.js';
import { fail } from './errors.js';

const login = z.object({ accessCode: z.string().min(16).max(256) }).strict();
const attempts = new Map();
const cookie = value => `athena_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=28800`;

function sameOrigin(req) {
  const origin = req.headers.origin;
  try { return req.headers['sec-fetch-site'] !== 'cross-site' && (!origin || new URL(origin).host === req.headers.host); }
  catch { return false; }
}

export function athenaSessionRoutes({ config, db }) {
  const router = Router();
  const authenticate = createAuthenticator(config);
  const accessCodeEnabled = Boolean(config.AUTH_SESSION_SECRET && config.AUTH_ACCESS_CODE_SHA256 && config.AUTH_SESSION_MEMBER_ID);
  router.get('/', async (req, res) => {
    try {
      const memberId = await authenticate(req);
      res.json({ data: { authenticated: true, memberId }, meta: { feature: 'athena', provider: accessCodeEnabled ? 'access-code' : 'bearer' } });
    } catch {
      res.json({ data: { authenticated: false }, meta: { feature: 'athena', provider: accessCodeEnabled ? 'access-code' : 'bearer' } });
    }
  });
  router.post('/', async (req, res, next) => {
    try {
      if (!accessCodeEnabled) throw fail(404, 'SESSION_LOGIN_DISABLED', 'Browser access-code login is not configured.');
      if (!sameOrigin(req)) throw fail(403, 'CROSS_SITE_REQUEST', 'Cross-site login is not allowed.');
      const key = req.ip || 'unknown'; const now = Date.now();
      const window = attempts.get(key) || { start: now, count: 0 };
      if (now - window.start > 15 * 60 * 1000) { window.start = now; window.count = 0; }
      if (++window.count > 10) throw fail(429, 'LOGIN_RATE_LIMITED', 'Too many sign-in attempts. Retry later.');
      attempts.set(key, window);
      const { accessCode } = login.parse(req.body);
      const actual = Buffer.from(createHash('sha256').update(accessCode).digest('hex'));
      const expected = Buffer.from(config.AUTH_ACCESS_CODE_SHA256.toLowerCase());
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw fail(401, 'INVALID_ACCESS_CODE', 'The Athena access code is invalid.');
      const member = await db.collection('members').findOne({ id: config.AUTH_SESSION_MEMBER_ID }, { projection: { _id: 0, id: 1 }, maxTimeMS: 5000, timeoutMS: 10000 });
      if (!member) throw fail(503, 'SESSION_MEMBER_MISSING', 'The configured Athena member does not exist in Atlas.');
      attempts.delete(key);
      res.setHeader('Set-Cookie', cookie(createSessionCookie(config)));
      res.json({ data: { authenticated: true, memberId: member.id }, meta: { feature: 'athena', provider: 'access-code' } });
    } catch (error) { next(error); }
  });
  router.delete('/', (req, res, next) => {
    if (!sameOrigin(req)) return next(fail(403, 'CROSS_SITE_REQUEST', 'Cross-site logout is not allowed.'));
    res.setHeader('Set-Cookie', 'athena_session=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0');
    res.status(204).end();
  });
  return router;
}
