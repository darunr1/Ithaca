import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fail } from './errors.js';

// Replace via createApp({ athene: { authenticate } }) when shared auth lands.
// authenticate(req) must return an existing members.id, never a client-supplied identity header.
export function createAuthenticator(config) {
  const keys = config.AUTH_JWKS_URL ? createRemoteJWKSet(new URL(config.AUTH_JWKS_URL), { timeoutDuration: 5000 }) : null;
  return async req => {
    const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(([key, value]) => key && value));
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '') || (cookies.athena_dev_session ? ['', cookies.athena_dev_session] : null);
    if (!match) throw fail(401, 'UNAUTHENTICATED', 'A bearer token is required.');
    if (config.ATHENE_DEV_TOKEN) {
      const actual = Buffer.from(match[1]); const expected = Buffer.from(config.ATHENE_DEV_TOKEN);
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (local && actual.length === expected.length && timingSafeEqual(actual, expected)) return config.ATHENE_DEV_MEMBER_ID;
    } else if (keys) {
      try {
        const { payload } = await jwtVerify(match[1], keys, { issuer: config.AUTH_ISSUER, audience: config.AUTH_AUDIENCE, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'], maxTokenAge: '1h' });
        if (typeof payload.sub === 'string' && payload.sub.length <= 128) return payload.sub;
      } catch { /* Never expose token or provider error details. */ }
    }
    throw fail(401, 'UNAUTHENTICATED', 'Invalid or expired bearer token.');
  };
}

export async function authorizeProject(db, memberId, projectId, write = false) {
  if (!memberId) throw fail(401, 'UNAUTHENTICATED', 'An authenticated member is required.');
  let member, club;
  try {
    [member, club] = await Promise.all([
      db.collection('members').findOne({ id: memberId }, { maxTimeMS: 5000, timeoutMS: 10000 }),
      db.collection('clubs').findOne({ id: projectId }, { maxTimeMS: 5000, timeoutMS: 10000 })
    ]);
  } catch { throw fail(503, 'DATABASE_UNAVAILABLE', 'Project access could not be verified.'); }
  if (!member || !club || !member.clubIds?.includes(projectId) || member.universityId !== club.universityId) {
    throw fail(404, 'PROJECT_NOT_FOUND', 'Project not found or inaccessible.');
  }
  if (write && !club.officerIds?.includes(memberId)) throw fail(403, 'UPLOAD_FORBIDDEN', 'Only project club officers may upload or reprocess documents.');
  return { member, club };
}
