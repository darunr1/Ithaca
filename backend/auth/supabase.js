import { createHash } from 'node:crypto';
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const onboarding = z.object({
  universityId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
  major: z.string().trim().min(2).max(120),
  graduationYear: z.coerce.number().int().min(new Date().getUTCFullYear()).max(new Date().getUTCFullYear() + 12)
}).strict();

function bearer(req) {
  const match = /^Bearer ([^\s]+)$/.exec(req.get('Authorization') || '');
  if (!match) throw fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return match[1];
}

function safeName(user) {
  const metadata = user.user_metadata || {};
  const candidate = metadata.full_name || metadata.name || [metadata.first_name, metadata.last_name].filter(Boolean).join(' ');
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim().slice(0, 160) : user.email.split('@')[0].slice(0, 160);
}

export function createSupabaseVerifier(config, { client, keySet } = {}) {
  const keys = keySet || createRemoteJWKSet(new URL(config.AUTH_JWKS_URL), { timeoutDuration: 5000 });
  const supabase = client || createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const cache = new Map();
  return async req => {
    const token = bearer(req);
    const cacheKey = createHash('sha256').update(token).digest('base64url');
    const cached = cache.get(cacheKey);
    if (cached?.until > Date.now()) return cached.identity;
    const payload = await verifySupabaseJwt(token, config, keys);
    if (typeof payload.sub !== 'string' || payload.sub.length > 128) throw fail(401, 'INVALID_SESSION', 'Your session is invalid.');
    let result;
    try { result = await supabase.auth.getUser(token); }
    catch { throw fail(503, 'AUTH_PROVIDER_UNAVAILABLE', 'Authentication could not be verified. Try again shortly.'); }
    if (result.error) {
      if (!result.error.status || result.error.status >= 500) throw fail(503, 'AUTH_PROVIDER_UNAVAILABLE', 'Authentication could not be verified. Try again shortly.');
      throw fail(401, 'INVALID_SESSION', 'Your session is invalid or expired. Sign in again.');
    }
    const user = result.data.user;
    if (!user || user.id !== payload.sub || !user.email) throw fail(401, 'INVALID_SESSION', 'Your session identity could not be verified.');
    if (!user.email_confirmed_at) throw fail(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email address before opening Ithaca.');
    const identity = { sub: user.id, email: user.email.toLowerCase(), name: safeName(user) };
    if (cache.size >= 500) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { identity, until: Math.min(Number(payload.exp) * 1000, Date.now() + 30_000) });
    return identity;
  };
}

export async function verifySupabaseJwt(token, config, keys) {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: config.AUTH_ISSUER,
      audience: config.AUTH_AUDIENCE,
      algorithms: ['RS256', 'ES256'],
      requiredClaims: ['sub', 'exp', 'iat'],
      maxTokenAge: '1h',
      clockTolerance: 10
    });
    return payload;
  } catch {
    throw fail(401, 'INVALID_SESSION', 'Your session is invalid or expired. Sign in again.');
  }
}

export async function provisionSupabaseProfile(db, identity) {
  let profile = await db.collection('userProfiles').findOne({ authProvider: 'supabase', authProviderUserId: identity.sub }, { projection: { _id: 0 } });
  if (profile) return profile;
  const now = new Date().toISOString();
  const record = {
    id: `profile-${createHash('sha256').update(identity.sub).digest('hex').slice(0, 24)}`,
    internalMemberId: identity.sub,
    authProvider: 'supabase',
    authProviderUserId: identity.sub,
    name: identity.name,
    email: identity.email,
    universityId: null,
    major: null,
    graduationYear: null,
    clubIds: [],
    role: 'member',
    visibleToCompanies: false,
    openToNewClubs: false,
    onboarded: false,
    createdAt: now,
    updatedAt: now
  };
  try {
    await db.collection('userProfiles').updateOne(
      { authProvider: 'supabase', authProviderUserId: identity.sub },
      { $setOnInsert: record },
      { upsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  profile = await db.collection('userProfiles').findOne({ authProvider: 'supabase', authProviderUserId: identity.sub }, { projection: { _id: 0 } });
  if (!profile) throw fail(503, 'PROFILE_PROVISIONING_FAILED', 'Your Ithaca profile could not be created.');
  return profile;
}

export function supabaseIdentity({ config, db, verify, requireOnboarding = true }) {
  const verifyRequest = config.AUTH_MODE === 'supabase' ? verify || createSupabaseVerifier(config) : null;
  return async (req, res, next) => {
    if (config.AUTH_MODE !== 'supabase') return next();
    try {
      const identity = await verifyRequest(req);
      let profile = await provisionSupabaseProfile(db, identity);
      if (profile.name !== identity.name || profile.email !== identity.email) {
        await db.collection('userProfiles').updateOne(
          { authProvider: 'supabase', authProviderUserId: identity.sub },
          { $set: { name: identity.name, email: identity.email, updatedAt: new Date().toISOString() } }
        );
        profile = { ...profile, name: identity.name, email: identity.email };
      }
      req.authProfile = profile;
      if (profile.onboarded) {
        const member = await db.collection('members').findOne({ id: profile.internalMemberId }, { projection: { _id: 0 } });
        if (!member) throw fail(503, 'MEMBER_PROFILE_MISSING', 'The authenticated Ithaca member profile is unavailable.');
        await db.collection('members').updateOne({ id: member.id }, { $set: { supabaseUserId: identity.sub, name: identity.name, email: identity.email, updatedAt: new Date().toISOString() } });
        req.memberId = member.id;
        req.authProfile = {
          ...profile,
          clubIds: member.clubIds || [],
          universityId: member.universityId,
          major: member.major,
          graduationYear: member.graduationYear ?? profile.graduationYear
        };
      }
      if (requireOnboarding && !profile.onboarded) throw fail(403, 'ONBOARDING_REQUIRED', 'Complete your Ithaca profile before opening the workspace.');
      next();
    } catch (error) {
      next(error?.status ? error : fail(503, 'DATABASE_UNAVAILABLE', 'Your authenticated profile could not be loaded because Atlas is unavailable.'));
    }
  };
}

export function authRoutes({ config, db, verify }) {
  const router = Router();
  router.get('/config', (req, res) => res.json({
    data: {
      mode: config.AUTH_MODE,
      supabaseUrl: config.AUTH_MODE === 'supabase' ? config.SUPABASE_URL : null,
      publishableKey: config.AUTH_MODE === 'supabase' ? config.SUPABASE_PUBLISHABLE_KEY : null
    }
  }));
  if (config.AUTH_MODE !== 'supabase') {
    router.get('/me', (req, res) => res.json({ data: { profile: null, onboardingRequired: false }, meta: { authentication: 'demo' } }));
    return router;
  }
  router.use(supabaseIdentity({ config, db, verify, requireOnboarding: false }));
  router.get('/me', (req, res) => res.json({ data: { profile: req.authProfile, onboardingRequired: !req.authProfile?.onboarded }, meta: { authentication: 'supabase' } }));
  router.get('/onboarding-options', async (req, res) => res.json({ data: { universities: await db.collection('universities').find({}, { projection: { _id: 0, id: 1, name: 1, state: 1 } }).sort({ name: 1 }).toArray() } }));
  router.post('/onboarding', async (req, res) => {
    if (req.authProfile.onboarded) return res.json({ data: { profile: req.authProfile } });
    const input = onboarding.parse(req.body);
    const university = await db.collection('universities').findOne({ id: input.universityId }, { projection: { _id: 0, id: 1 } });
    if (!university) throw fail(400, 'UNKNOWN_UNIVERSITY', 'Choose a registered Ithaca university.');
    const member = {
      id: req.authProfile.internalMemberId,
      supabaseUserId: req.authProfile.authProviderUserId,
      name: req.authProfile.name,
      email: req.authProfile.email,
      universityId: university.id,
      major: input.major,
      graduationYear: input.graduationYear,
      year: 1,
      clubIds: [],
      skills: [],
      visibleToCompanies: false,
      openToNewClubs: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection('members').updateOne({ id: member.id }, { $setOnInsert: member }, { upsert: true });
    await db.collection('userProfiles').updateOne(
      { authProvider: 'supabase', authProviderUserId: req.authProfile.authProviderUserId },
      { $set: { universityId: university.id, major: input.major, graduationYear: input.graduationYear, onboarded: true, updatedAt: new Date().toISOString() } }
    );
    const profile = await db.collection('userProfiles').findOne({ authProvider: 'supabase', authProviderUserId: req.authProfile.authProviderUserId }, { projection: { _id: 0 } });
    res.json({ data: { profile } });
  });
  return router;
}
