import { httpError } from '../services/workspace.js';

// The Supabase middleware is the only production authority that may populate
// these fields. Never accept identity from headers, JSON bodies or query strings.
export function requireVerifiedMemberId(req) {
  const profile = req?.authProfile;
  if (!req?.memberId || profile?.authProvider !== 'supabase' ||
      profile.authProviderUserId !== req.memberId ||
      profile.internalMemberId !== req.memberId) {
    throw httpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  return req.memberId;
}
