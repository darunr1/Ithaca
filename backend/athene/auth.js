import { createHmac, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fail } from './errors.js';

// Replace via createApp({ athene: { authenticate } }) when shared auth lands.
// authenticate(req) must return an existing members.id, never a client-supplied identity header.
export function createAuthenticator(config) {
  const keys = config.AUTH_JWKS_URL ? createRemoteJWKSet(new URL(config.AUTH_JWKS_URL), { timeoutDuration: 5000 }) : null;
  return async req => {
    const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(([key, value]) => key && value));
    if (cookies.athena_session && config.AUTH_SESSION_SECRET) {
      const [encoded, signature] = cookies.athena_session.split('.');
      if (encoded && signature) {
        const expected = createHmac('sha256', config.AUTH_SESSION_SECRET).update(encoded).digest('base64url');
        const actualBytes = Buffer.from(signature); const expectedBytes = Buffer.from(expected);
        if (actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)) {
          try {
            const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
            if (payload.v === 1 && payload.sub === config.AUTH_SESSION_MEMBER_ID && typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000)) return payload.sub;
          } catch { /* Invalid cookies fail as unauthenticated. */ }
        }
      }
    }
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
    throw fail(401, 'UNAUTHENTICATED', 'Sign in to Athena or provide a valid bearer token.');
  };
}

export function createSessionCookie(config, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ v: 1, sub: config.AUTH_SESSION_MEMBER_ID, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 8 * 60 * 60 })).toString('base64url');
  const signature = createHmac('sha256', config.AUTH_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export async function authorizeProject(db, memberId, projectId, write = false) {
  if (!memberId || typeof memberId !== 'string' || memberId.length > 128) throw fail(401, 'UNAUTHENTICATED', 'An authenticated member is required.');
  if (typeof projectId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(projectId)) throw fail(404, 'PROJECT_NOT_FOUND', 'Project not found or inaccessible.');
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

// Final response boundary. A service adapter may never serialize a record
// whose club scope disagrees with the authenticated URL club.
export function assertAtheneScope(value, clubId) {
  const rows = Array.isArray(value) ? value
    : value?.documents ? value.documents
    : value?.insights ? value.insights : [value];
  // Check top-level answers *and* citations nested in saved insight lists.
  // Older saved reports predate citation.projectId, so absent values remain
  // compatible; new citations carry explicit projectId from trusted retrieval.
  const citationGroups = [
    ...(Array.isArray(value?.citations) ? [value.citations] : []),
    ...rows.filter(row => row && Array.isArray(row.citations)).map(row => row.citations)
  ];
  if (!Array.isArray(rows) || rows.some(row => !row || row.projectId !== clubId) ||
      citationGroups.some(group => group.some(c => !c || (c.projectId && c.projectId !== clubId)))) {
    throw fail(503, 'ATHENE_SCOPE_ERROR', 'Athena returned data from an invalid club scope.');
  }
  return value;
}
