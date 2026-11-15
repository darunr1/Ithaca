# Supabase authentication and production setup

Ithaca uses Supabase Auth only for identity and browser sessions. MongoDB Atlas remains the source of truth for members, clubs, project authorization, documents, contributions, and every application role. Ithaca never stores passwords or a Supabase secret/service-role key.

## 1. Create the Supabase project

1. Create or select a Supabase project. In **Authentication → Providers → Email**, enable email/password and keep **Confirm email** enabled.
2. In **Authentication → URL Configuration**, set:
   - Site URL: `https://ithaca10.vercel.app`
   - Redirect URLs: `https://ithaca10.vercel.app/dashboard` and `https://ithaca10.vercel.app/reset-password`
   - Add the equivalent exact URLs for every Vercel Preview deployment used to test authentication. Do not use wildcard production redirects.
3. In **Project Settings → API Keys**, copy the Project URL and the publishable key (`sb_publishable_...`). A legacy anon key also works, but a publishable key is preferred.
4. In **Authentication → Signing Keys**, rotate the project to an asymmetric signing key (RS256 or ES256) if it still uses the legacy shared JWT secret. Wait for the rotation/standby interval to finish before revoking the old key. Confirm this URL returns at least one public key:

   ```text
   https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
   ```

The checked-in browser bundle is the official `@supabase/supabase-js` package. It persists and refreshes the browser session. Every same-origin API request sends the short-lived access token in `Authorization: Bearer ...`; the Express API verifies it independently. The publishable key is intentionally returned by `/api/auth/config`. It is not a server secret.

## 2. Vercel variables

Set these for Production, and separately for any Preview environment that should use live accounts:

```dotenv
AUTH_MODE=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
AUTH_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
AUTH_ISSUER=https://<project-ref>.supabase.co/auth/v1
AUTH_AUDIENCE=authenticated

DATA_MODE=atlas
MONGODB_URI=mongodb+srv://<restricted-user>:<url-encoded-password>@<cluster>/?retryWrites=true&w=majority
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

Never configure `ATHENE_DEV_TOKEN`, `AUTH_SESSION_SECRET`, `AUTH_ACCESS_CODE_SHA256`, a Supabase secret/service-role key, or a local development access token in Vercel. Never put `MONGODB_URI` or `GEMINI_API_KEY` in frontend code.

## 3. Prepare Atlas once

Run these commands from a trusted machine with the production Atlas variables loaded. They must not run in Vercel's build step:

```powershell
npm ci
npm run db:setup
npm run athene:setup
```

`db:setup` installs the `userProfiles` validator, the unique `(authProvider, authProviderUserId)` and `internalMemberId` indexes, and the sparse unique `members.supabaseUserId` index. `athene:setup` creates the document/chunk indexes; wait until `athene_chunks_vector` is READY.

New verified users are provisioned on their first authenticated request with `role=member`, no clubs, no visibility, and no officer/admin/recruiter rights. Onboarding creates the compatible `members` record using the verified Supabase UUID. A club administrator must grant club membership separately.

## 4. Link an existing Ithaca member

To preserve an existing member's clubs, contributions, and officer status, have the person sign up and verify their email, then copy their UUID from **Supabase → Authentication → Users**. Before they complete Ithaca onboarding, run a deliberate Atlas migration:

```javascript
const supabaseUserId = "<verified-user-uuid>";
const existingMemberId = "member-iris";
const now = new Date().toISOString();
const member = db.members.findOne({ id: existingMemberId });

db.members.updateOne({ id: existingMemberId }, { $set: { supabaseUserId, updatedAt: now } });
db.userProfiles.updateOne(
  { authProvider: "supabase", authProviderUserId: supabaseUserId },
  { $set: {
    internalMemberId: existingMemberId,
    name: member.name,
    email: member.email,
    universityId: member.universityId,
    major: member.major,
    graduationYear: member.graduationYear ?? null,
    clubIds: member.clubIds,
    role: "member",
    visibleToCompanies: member.visibleToCompanies,
    openToNewClubs: member.openToNewClubs,
    onboarded: true,
    updatedAt: now
  }}
);
```

Do not copy Clerk IDs into Supabase fields. Existing Clerk profile records must be backed up and deliberately migrated or removed before applying the Supabase-only validator; there is no automatic identity match between providers.

## 5. Production verification

1. Open `/signup`, create an account, and verify it through the email link.
2. Confirm the browser reaches `/dashboard` and Atlas contains one `userProfiles` record for the Supabase UUID.
3. Complete onboarding; confirm the new `members` record has no clubs or privileged roles.
4. Log out. `/dashboard` must redirect to `/login`, and `/api/clubs` without a bearer token must return 401.
5. Link the intended demo officer with the migration above. Sign in and verify Home, Athena, Kleos Ledger, Court, and Bow.
6. Upload an allowed document as the linked club officer, ask a question, inspect citations, and verify the contribution analysis. A non-officer member must receive 403 for upload.
7. Test `/forgot-password`; the email must return to `/reset-password`, and the old password must no longer work after the change.

The browser redirect is a usability guard. Security comes from asymmetric JWT verification, Supabase's confirmed-user lookup, and MongoDB membership/officer checks in Express.
