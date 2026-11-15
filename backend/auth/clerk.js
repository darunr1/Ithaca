import { createHash } from 'node:crypto';
import { Router } from 'express';
import { clerkClient, clerkMiddleware, getAuth } from '@clerk/express';
import { z } from 'zod';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const onboarding = z.object({ universityId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/), major: z.string().trim().min(2).max(120) }).strict();
const internalId = clerkUserId => `member-${createHash('sha256').update(clerkUserId).digest('hex').slice(0, 24)}`;

export function installClerk(app, config, middleware = clerkMiddleware) {
  if (config.AUTH_MODE === 'clerk') app.use(middleware({ publishableKey: config.CLERK_PUBLISHABLE_KEY, secretKey: config.CLERK_SECRET_KEY }));
}

function verifiedEmail(user) {
  const email = user.emailAddresses?.find(item => item.id === user.primaryEmailAddressId) || user.emailAddresses?.[0];
  return email?.verification?.status === 'verified' ? email.emailAddress : null;
}

export async function provisionClerkProfile(db, clerkUserId, client = clerkClient) {
  let profile = await db.collection('userProfiles').findOne({ authProviderUserId: clerkUserId }, { projection: { _id: 0 } });
  if (profile) return profile;
  const user = await client.users.getUser(clerkUserId);
  const email = verifiedEmail(user);
  if (!email) throw fail(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email address before opening Ithaca.');
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || email.split('@')[0];
  const record = {
    id: `profile-${createHash('sha256').update(clerkUserId).digest('hex').slice(0, 24)}`,
    internalMemberId: internalId(clerkUserId), authProvider: 'clerk', authProviderUserId: clerkUserId,
    name, email, universityId: null, major: null, clubIds: [], role: 'member',
    visibleToCompanies: false, openToNewClubs: false, onboarded: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  await db.collection('userProfiles').updateOne({ authProviderUserId: clerkUserId }, { $setOnInsert: record }, { upsert: true });
  return db.collection('userProfiles').findOne({ authProviderUserId: clerkUserId }, { projection: { _id: 0 } });
}

export function clerkIdentity({ config, db, client = clerkClient, auth = getAuth, requireOnboarding = true }) {
  return async (req, res, next) => {
    if (config.AUTH_MODE !== 'clerk') return next();
    try {
      const { userId } = auth(req);
      if (!userId) throw fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      const user = await client.users.getUser(userId); const email = verifiedEmail(user);
      if (!email) throw fail(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email address before opening Ithaca.');
      let profile = await provisionClerkProfile(db, userId, { users: { getUser: async () => user } });
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || email.split('@')[0];
      if (profile.name !== name || profile.email !== email) {
        await db.collection('userProfiles').updateOne({ authProviderUserId: userId }, { $set: { name, email, updatedAt: new Date().toISOString() } });
        profile = { ...profile, name, email };
      }
      req.authProfile = profile;
      if (profile.onboarded) {
        const member = await db.collection('members').findOne({ id: profile.internalMemberId }, { projection: { _id: 0, id: 1, clubIds: 1, universityId: 1, major: 1 } });
        if (!member) throw fail(503, 'MEMBER_PROFILE_MISSING', 'The authenticated Ithaca member profile is unavailable.');
        await db.collection('members').updateOne({ id: member.id, clerkUserId: userId }, { $set: { name, email } });
        req.memberId = member.id;
        req.authProfile = { ...profile, clubIds: member.clubIds, universityId: member.universityId, major: member.major };
      }
      if (requireOnboarding && !profile.onboarded) throw fail(403, 'ONBOARDING_REQUIRED', 'Complete your Ithaca profile before opening the workspace.');
      next();
    } catch (error) { next(error); }
  };
}

export function authRoutes({ config, db, client = clerkClient, auth = getAuth }) {
  const router = Router();
  router.get('/config', (req, res) => res.json({ data: { mode: config.AUTH_MODE, publishableKey: config.AUTH_MODE === 'clerk' ? config.CLERK_PUBLISHABLE_KEY : null } }));
  if (config.AUTH_MODE !== 'clerk') {
    router.get('/me', (req, res) => res.json({ data: { profile: null, onboardingRequired: false }, meta: { authentication: 'demo' } }));
    return router;
  }
  router.use(clerkIdentity({ config, db, client, auth, requireOnboarding: false }));
  router.get('/me', (req, res) => res.json({ data: { profile: req.authProfile, onboardingRequired: !req.authProfile?.onboarded }, meta: { authentication: config.AUTH_MODE } }));
  router.get('/onboarding-options', async (req, res) => res.json({ data: { universities: await db.collection('universities').find({}, { projection: { _id: 0, id: 1, name: 1, state: 1 } }).sort({ name: 1 }).toArray() } }));
  router.post('/onboarding', async (req, res) => {
    if (req.authProfile.onboarded) return res.json({ data: { profile: req.authProfile } });
    const input = onboarding.parse(req.body);
    const university = await db.collection('universities').findOne({ id: input.universityId }, { projection: { _id: 0, id: 1 } });
    if (!university) throw fail(400, 'UNKNOWN_UNIVERSITY', 'Choose a registered Ithaca university.');
    const member = {
      id: req.authProfile.internalMemberId, clerkUserId: req.authProfile.authProviderUserId,
      name: req.authProfile.name, email: req.authProfile.email, universityId: university.id,
      major: input.major, year: 1, clubIds: [], skills: [], visibleToCompanies: false, openToNewClubs: false
    };
    await db.collection('members').updateOne({ id: member.id }, { $setOnInsert: member }, { upsert: true });
    await db.collection('userProfiles').updateOne({ authProviderUserId: req.authProfile.authProviderUserId }, { $set: { universityId: university.id, major: input.major, onboarded: true, updatedAt: new Date().toISOString() } });
    const profile = await db.collection('userProfiles').findOne({ authProviderUserId: req.authProfile.authProviderUserId }, { projection: { _id: 0 } });
    res.json({ data: { profile } });
  });
  return router;
}
