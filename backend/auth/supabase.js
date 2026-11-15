import { createHash } from 'node:crypto';
import multer from 'multer';
import { normalize } from '../services/colleges.js';
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const MAX_RESUME_BYTES = 2 * 1024 * 1024;
const CLASS_YEARS = Object.freeze({ freshman: 1, sophomore: 2, junior: 3, senior: 4, graduate: 5 });
const onboarding = z.object({
  universityName: z.string().trim().min(2).max(160),
  classification: z.enum(Object.keys(CLASS_YEARS)),
  major: z.string().trim().min(2).max(120),
  graduationYear: z.coerce.number().int().min(new Date().getUTCFullYear()).max(new Date().getUTCFullYear() + 12)
}).strict();

// Older accounts may say "onboarded" even though the academic profile was never completed.
// A checked box alone must never unlock the workspace.
export function needsStudentOnboarding(profile) {
  return !profile?.onboarded ||
    typeof profile.universityName !== 'string' || profile.universityName.trim().length < 2 ||
    typeof profile.major !== 'string' || profile.major.trim().length < 2 ||
    !Object.hasOwn(CLASS_YEARS, profile.classification) ||
    !Number.isInteger(profile.graduationYear);
}

const parseResume = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 0 }
}).single('resume');

function resumeUpload(req, res, next) {
  parseResume(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return next(fail(413, 'RESUME_TOO_LARGE', 'Resumes must be 2 MB or smaller.'));
    next(fail(400, 'RESUME_UPLOAD_INVALID', 'Upload a single PDF or DOCX resume.'));
  });
}

function inspectResume(file) {
  if (!file || !file.buffer?.length) throw fail(400, 'RESUME_REQUIRED', 'Select a PDF or DOCX resume.');
  const originalName = String(file.originalname || '').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!originalName || originalName.length > 140) throw fail(400, 'RESUME_FILENAME_INVALID', 'Use a filename shorter than 140 characters.');
  const ext = originalName.split('.').pop().toLowerCase();
  const isPdf = ext === 'pdf' && file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-';
  const isDocx = ext === 'docx' &&
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'].includes(file.mimetype) &&
    file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (!isPdf && !isDocx) throw fail(415, 'RESUME_TYPE_UNSUPPORTED', 'Only valid PDF or DOCX files can be uploaded.');
  return { filename: originalName, contentType: isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: file.size, uploadedAt: new Date().toISOString() };
}

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
    universityName: null,
    classification: null,
    resume: null,
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
          graduationYear: member.graduationYear ?? profile.graduationYear,
          universityName: member.universityName ?? profile.universityName,
          classification: member.classification ?? profile.classification
        };
      }
      req.onboardingRequired = needsStudentOnboarding(req.authProfile);
      if (requireOnboarding && req.onboardingRequired) throw fail(403, 'ONBOARDING_REQUIRED', 'Complete your university, classification, major, and graduation year before opening the workspace.');
      next();
    } catch (error) {
      next(error?.status ? error : fail(503, 'DATABASE_UNAVAILABLE', 'Your authenticated profile could not be loaded because Atlas is unavailable.'));
    }
  };
}

export function authRoutes({ config, db, verify, directory }) {
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
  router.get('/me', (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json({ data: { profile: req.authProfile, onboardingRequired: req.onboardingRequired }, meta: { authentication: 'supabase' } });
  });
  router.get('/university-search', async (req, res) => {
    const query = String(req.query.q || '').trim().slice(0, 80);
    if (query.length < 2) return res.json({ data: { universities: [] } });
    const registered = await db.collection('universities').find({}, { projection: { _id: 0, id: 1, name: 1 } }).toArray();
    res.json({ data: { universities: directory.search(query, { registered, limit: 10 }) } });
  });

  // Resumes are private and scoped to the verified Supabase identity, never to a client-provided member ID.
  router.post('/resume', resumeUpload, async (req, res) => {
    const resume = inspectResume(req.file);
    const ownerId = req.authProfile.authProviderUserId;
    await db.collection('resumeFiles').updateOne(
      { id: `resume-${ownerId}` },
      { $set: { id: `resume-${ownerId}`, authProviderUserId: ownerId, ...resume, content: req.file.buffer } },
      { upsert: true }
    );
    await db.collection('userProfiles').updateOne(
      { authProvider: 'supabase', authProviderUserId: ownerId },
      { $set: { resume, updatedAt: new Date().toISOString() } }
    );
    res.json({ data: { resume } });
  });
  router.get('/resume', async (req, res) => {
    const item = await db.collection('resumeFiles').findOne({ id: `resume-${req.authProfile.authProviderUserId}` });
    if (!item) throw fail(404, 'RESUME_NOT_FOUND', 'No resume has been uploaded.');
    // Copy only the declared byte range: Buffer.from(view.buffer) can expose pooled memory outside the file.
    const binary = item.content?.buffer instanceof Uint8Array ? item.content.buffer : item.content;
    if (!(binary instanceof Uint8Array)) throw fail(500, 'RESUME_STORAGE_INVALID', 'Saved resume data is unavailable.');
    const buffer = Buffer.from(binary);
    res.set('Content-Type', item.contentType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, no-store');
    res.set('Content-Disposition', `attachment; filename="resume.${item.contentType === 'application/pdf' ? 'pdf' : 'docx'}"; filename*=UTF-8''${encodeURIComponent(item.filename)}`);
    res.send(buffer);
  });
  router.delete('/resume', async (req, res) => {
    const ownerId = req.authProfile.authProviderUserId;
    await db.collection('resumeFiles').deleteOne({ id: `resume-${ownerId}` });
    await db.collection('userProfiles').updateOne(
      { authProvider: 'supabase', authProviderUserId: ownerId },
      { $set: { resume: null, updatedAt: new Date().toISOString() } }
    );
    res.json({ data: { resume: null } });
  });

  router.post('/onboarding', async (req, res) => {
    // Reusable for first login, legacy incomplete accounts, and owner-initiated edits.
    const input = onboarding.parse(req.body);
    const registered = await db.collection('universities').findOne({ name: input.universityName }, { projection: { _id: 0, id: 1, name: 1 } });
    const match = directory.search(input.universityName, { limit: 10 }).find(item => normalize(item.name) === normalize(input.universityName));
    const universityName = registered?.name || match?.name || input.universityName;
    const universityId = registered?.id || match?.id || `self-${createHash('sha256').update(normalize(universityName)).digest('hex').slice(0, 24)}`;
    const current = req.authProfile;
    if (current.onboarded && current.clubIds?.length && current.universityId && current.universityId !== universityId) {
      throw fail(409, 'UNIVERSITY_CHANGE_REQUIRES_ADMIN', 'Ask your club administrator to transfer your university while you belong to a club.');
    }
    const now = new Date().toISOString();
    const academic = {
      universityId, universityName, classification: input.classification,
      major: input.major, graduationYear: input.graduationYear
    };
    const memberId = current.internalMemberId;
    await db.collection('members').updateOne(
      { id: memberId },
      { $setOnInsert: {
        id: memberId, supabaseUserId: current.authProviderUserId,
        name: current.name, email: current.email, ...academic,
        year: CLASS_YEARS[input.classification], clubIds: [], skills: [],
        visibleToCompanies: false, openToNewClubs: false,
        createdAt: now, updatedAt: now
      } },
      { upsert: true }
    );
    // Preserve memberships and permissions on edits, while updating only academic facts.
    await db.collection('members').updateOne({ id: memberId },
      { $set: { ...academic, year: CLASS_YEARS[input.classification], updatedAt: now } });
    await db.collection('userProfiles').updateOne(
      { authProvider: 'supabase', authProviderUserId: current.authProviderUserId },
      { $set: { ...academic, onboarded: true, updatedAt: now } }
    );
    const profile = await db.collection('userProfiles').findOne({ authProvider: 'supabase', authProviderUserId: req.authProfile.authProviderUserId }, { projection: { _id: 0 } });
    res.json({ data: { profile } });
  });
  return router;
}
