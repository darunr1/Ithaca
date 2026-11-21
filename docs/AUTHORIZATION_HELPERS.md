# Shared production authorization helpers

Day 1 PR 02 introduces three async, fail-closed checks in `backend/services/authorization.js`:

- `requireClubMember(req, db, clubId)`: verifies a Supabase-authenticated middleware context and **fresh** stored member membership, club existence, university match.
- `requireOfficer(req, db, clubId)`: member check plus server-stored `club.officerIds` / owner permission.
- `requireProjectLead(req, db, clubId, projectId)`: member check plus same-club project lookup and stored project lead or officer permission.

All three accept the request **after** `supabaseIdentity` ran. They derive actor ID exclusively from `req.memberId`, check the verified `req.authProfile` binding, and never read client-supplied IDs for identity. Do not call these in demo mode: demo identity is deliberately unverified. Call at the beginning of each protected handler, and check the intended club or record before sending sensitive data or writing. A foreign or revoked membership returns 404, a valid member with insufficient privilege returns 403, and an invalid identity returns 401.

They do not magically make a mutation atomic; multi-document updates still require scoped write predicates / transactions. PRs 03–04 integrate them in legacy reads/writes.

Run `npm run build` (syntax check and all Node tests); `tests/authorization.test.js` covers forged identity, stale profile claims, revoked membership, university mismatch, non-officer, cross-club lead and missing project.
