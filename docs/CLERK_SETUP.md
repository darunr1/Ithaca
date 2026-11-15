# Clerk authentication and production setup

Ithaca uses Clerk as the authentication authority and MongoDB Atlas for application profiles and authorization. Clerk owns passwords, Google OAuth, email verification, session cookies, and logout. Ithaca never receives or stores passwords.

## 1. Create and configure Clerk

1. Create a Clerk application at the Clerk Dashboard.
2. Under **User & Authentication**, enable email address authentication and require email verification.
3. Under **SSO connections**, enable Google. Complete Clerk's production Google OAuth configuration before switching to live keys.
4. Add these allowed application URLs:
   - Home: `https://ithaca10.vercel.app/`
   - Sign in: `https://ithaca10.vercel.app/sign-in`
   - Sign up: `https://ithaca10.vercel.app/sign-up`
   - After sign in/up: `https://ithaca10.vercel.app/app`
   - After sign out: `https://ithaca10.vercel.app/`
5. Copy the production Publishable Key and create a production Secret Key under **API keys**.

The publishable key is intentionally returned by `/api/auth/config` so ClerkJS can initialize. The secret key is consumed only by `@clerk/express` and must never appear in frontend code, logs, screenshots, or Git.

## 2. Vercel environment

Set these values for Production and for any Preview environment used to test real sign-in:

```dotenv
AUTH_MODE=clerk
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

DATA_MODE=atlas
MONGODB_URI=mongodb+srv://<restricted-user>:<encoded-password>@<cluster>/?retryWrites=true&w=majority
MONGODB_DB=ithaca_demo

AI_MODE=live
GEMINI_API_KEY=<server-side-key>
GEMINI_MODEL=gemini-3.8-flash

ATHENE_ENABLED=true
ATHENE_GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
MONGODB_VECTOR_INDEX=athene_chunks_vector
ATHENE_CHUNK_SIZE=1400
ATHENE_CHUNK_OVERLAP=200
ATHENE_TOP_K=6
ATHENE_MIN_SCORE=0.65

NODE_ENV=production
```

Do not configure `ATHENE_DEV_TOKEN`, `AUTH_SESSION_SECRET`, or a demo access code in Clerk production mode.

## 3. Prepare Atlas

Run once from a trusted terminal with the same Atlas configuration:

```powershell
npm run db:setup
npm run db:seed
npm run athene:setup
```

`db:setup` creates `userProfiles` with unique indexes on `authProviderUserId` and `internalMemberId`, and a sparse unique Clerk identity index on `members`. `athene:setup` prepares the document/chunk collections and vector index. Wait until `athene_chunks_vector` is READY.

New Clerk users are provisioned synchronously on their first authenticated request. The initial profile has `role=member`, no university, no clubs, no visibility, and no officer/admin rights. Onboarding requires a user-selected registered university and major, then creates the compatible `members` record. Club membership remains an administrator action.

## 4. Link an existing Ithaca member

To give an existing seeded member their established clubs and contributions, first let that person sign in once but do not complete onboarding. Copy their Clerk user ID from the Clerk Dashboard, then deliberately link the two records in Atlas:

```javascript
const clerkUserId = "user_...";
const existingMemberId = "member-iris";
const member = db.members.findOne({ id: existingMemberId });
db.members.updateOne({ id: existingMemberId }, { $set: { clerkUserId } });
db.userProfiles.updateOne(
  { authProviderUserId: clerkUserId },
  { $set: {
    internalMemberId: existingMemberId,
    universityId: member.universityId,
    major: member.major,
    clubIds: member.clubIds,
    onboarded: true,
    updatedAt: new Date().toISOString()
  } }
);
```

Do not add the member to `clubs.officerIds` unless the club has separately approved that role. The API reloads current memberships from the `members` record on every authenticated request and Athena independently verifies membership, university scope, and officer upload permission.

## 5. Verify production

1. Visit `/`; the public landing page must load without authentication.
2. Create a new account at `/sign-up` using Google or verified email.
3. Confirm `userProfiles` contains exactly one record for the Clerk user ID.
4. Complete onboarding and confirm the generated member has no club memberships or elevated role.
5. Signed-out requests to `/api/clubs` must return 401; incomplete profiles must receive `ONBOARDING_REQUIRED`.
6. Link the demo officer deliberately, sign in again, and open `/app`.
7. Verify Home, Athena, Kleos Ledger, Court, and Bow.
8. Upload less than 4 MiB combined to Athena, ask a question, inspect citations, and run contribution analysis.
9. Log out from Clerk's user menu, then revisit `/app`; it must redirect to `/sign-in` and protected APIs must reject the old browser state.

The browser redirect is a usability guard. Security comes from Clerk session verification and MongoDB authorization on the Express API.
