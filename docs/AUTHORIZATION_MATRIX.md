# API authorization matrix (Day 1 / PR 01)

**Source:** `main` at `d5f78785605810c553c5c1fe22bb3589222eed3f`, reviewed 2026-11-21. This is a **current-state inventory plus desired guardrails**, not a claim that every safeguard is implemented. No runtime behavior is changed by this PR.

## Modes and trust boundaries

- In production, `AUTH_MODE=supabase` uses a verified Supabase JWT plus `auth.getUser`; `supabaseIdentity` resolves `req.memberId` from the provider ID and an Atlas `members` document. A caller-controlled `X-Demo-Member` header has **no production authority**.
- Legacy demo mode uses fictional records; selected ledger routes accept a spoofable `X-Demo-Member`. **Never deploy demo identity for real user data.**
- Membership is held in `members.clubIds`; officer authority is held in `clubs.officerIds` (and project ownership in `clubs.ownerId`). A stale `userProfiles.clubIds` claim alone must not authorize private data. Officers and leads must also be current club members.
- `/api/projects/:projectId/athene` uses **club IDs**, despite its historical `projectId` parameter; it is not a `clubProjects.id`. Project workspace routes are under `/api/organizations/:clubId/projects`.
- Public recruiter output is consent-filtered (`visibleToCompanies`) and must remain strictly allowlisted. The general `/members/:id` view is **not** recruiter-safe.
- The first-party UI also serves non-`/api` routes; they are intentionally excluded. Catch-all unknown `/api/*` returns 404.

## Authentication, health and sessions

| Route | Identity / allowed role | Club boundary | Sensitive fields / behavior | Cross-club risk or required safeguard |
|---|---|---|---|---|---|
| GET `/api/health` | Public | Global | Deployment status / modes | None; no club data |
| GET `/api/auth/config` | Public | Global | Supabase URL and publishable key (not a secret) | Ensure no privileged key |
| GET `/api/auth/me` | Verified Supabase token; demo returns null | Self | Full userProfiles document including email, academic fields, clubs, resume metadata | No-store; confirm projection excludes future private fields |
| GET `/api/auth/university-search` | Verified token | Global directory | University names/IDs | No member data |
| POST `/api/auth/onboarding` | Verified token | Self | Academic fields / profile | Untrusted clubIds or roles rejected |
| POST `/api/auth/resume` | Verified token | Self | Resume metadata + inferred skills | Binary stored keyed by verified provider ID |
| GET `/api/auth/resume` | Verified token | Self | Private PDF/DOCX bytes | Cross-account download must remain impossible |
| DELETE `/api/auth/resume` | Verified token | Self | Deletion status | No client owner ID |
| POST `/api/athena-dev-session` | Localhost dev token (nonproduction only) | Configured dev member | Dev cookie + member ID | Never enable in production |
| GET `/api/athena-session` | Legacy configured cookie/bearer; demo only | Self | Member ID/login state | Not a Supabase production entrypoint |
| POST `/api/athena-session` | Access code in legacy non-Supabase mode | Configured member | Sets signed cookie | Code brute force, same-origin, production config |
| DELETE `/api/athena-session` | Legacy session | Self | Cookie clear | Cannot revoke another session |

## Legacy reads, ledger and public aggregates

| Route | Identity / allowed role | Club boundary | Sensitive fields / behavior | Cross-club risk or required safeguard |
|---|---|---|---|---|---|
| GET `/api/recruiter/discovery-options` | Production verified (demo open) | Global reference catalogs | Majors, universities, club suggestions | No private member fields |
| GET `/api/clubs` | Production verified | Actor membership list | Club documents | Use fresh membership, not solely profile snapshot |
| GET `/api/clubs/:id/roster` | Production verified + member | Single club | Entire `members` records (email, flags, other clubIds) **HIGH** | Raw record leaks; project to club-scoped allowlist |
| GET `/api/clubs/:id/sessions` | Production verified + member | Single club | Session content/metadata | No out-of-club session enumeration |
| GET `/api/clubs/:id/drafts` | Production verified + member (currently any member) | Single club | Pending drafts + member-submitted evidence **HIGH** | Officer-only queue / own requests; raw evidence |
| GET `/api/members/:id` | Production verified + same club, or self | Target member (currently multi-club) | Raw member + approved contributions and attendance **HIGH** | Shared one club must not reveal other clubs' records |
| GET `/api/clubs/:id/rankings` | Production verified + member | Single club | Approved points/names | No other club or private notes |
| GET `/api/recruiter/profiles` | Production verified (demo open) | Opt-in only, cross-club public projection | Public member fields + approved evidence | Consent check and explicit field allowlist |
| GET `/api/recruiter/profiles/:id` | Production verified (demo open) | Opt-in target | Public member fields + approved evidence | Hidden and nonexistent identical 404 |
| GET `/api/clubs/:id/semesters` | Demo asserted or verified actor + officer | Single club | Approved entries + pending request evidence **HIGH** | Officer must also be active member |
| GET `/api/clubs/:id/contribution-requests` | Demo asserted or verified actor + member | Own requests in club | Own pending evidence/status | Re-check membership on reads |
| POST `/api/clubs/:id/contribution-requests` | Demo asserted or verified actor + non-officer member | Actor's club | New pending draft/evidence | Actor from server, not body |
| POST `/api/contribution-requests/:id/review` | Demo asserted or verified actor + officer | Draft's club | Reviewed draft, evidence + new contribution **HIGH** | Forged ID; revoked officer; server-side scope |
| POST `/api/contributions/:id/reject` | Demo asserted or verified actor + officer | Contribution's club | Soft delete + audit **HIGH** | Forged ID; revoked officer; self-review |
| GET `/api/universities` | Production verified (demo open) | Public aggregation | Approved university totals | Aggregate only |
| GET `/api/universities/:id/leaderboard` | Production verified (demo open) | Public university | Approved contribution aggregates | Avoid raw member data |
| GET `/api/leaderboard/filters` | Production verified (demo open) | Global catalog | Organization/major choices | Reference data only |
| GET `/api/leaderboard` | Production verified (demo open) | Public aggregate | Approved contributor aggregates | No private draft/evidence |
| GET `/api/colleges/search` | Production verified (demo open) | Global directory | College reference data | No member data |

## Club creation, invitations, succession

| Route | Identity / allowed role | Club boundary | Sensitive fields / behavior | Cross-club risk or required safeguard |
|---|---|---|---|---|---|
| POST `/api/organizations` | Verified + onboarded | Self/new club | Created club / creator officer ID | Actor/server assigns officer role |
| GET `/api/organizations/invitations` | Verified | Own pending invitations | Inviter, target, club IDs | Strict invitedMemberId match |
| POST `/api/organizations/invitations/:inviteId/respond` | Verified invitee | Own invitation and club | Membership mutation **HIGH** | Validate club still exists, university/issuer context |
| GET `/api/organizations/:clubId/invitations` | Verified current officer | One club | Pending invitation member names | No unrelated clubs |
| POST `/api/organizations/:clubId/invitations` | Verified current officer | One club / same university target | Invitation and invitee metadata | Reject forged target IDs |
| GET `/api/organizations/:clubId/roster-stats` | Verified member | One club | Member analytics | No raw contact fields |
| GET `/api/organizations/:clubId/succession` | Verified officer | One club | Roles, nominees + skill evidence | May expose leadership signals |
| POST `/api/organizations/:clubId/succession` | Verified officer | One club | New succession role | Server scope, no arbitrary officer IDs |
| GET `/api/organizations/succession-offers` | Verified nominee | Own club offers | Role/nomination data | No other person's offers |
| POST `/api/organizations/:clubId/succession/:roleId/nominate` | Verified officer | Role in same club | Candidate nomination | Candidate must still be club member |
| POST `/api/organizations/:clubId/succession/:roleId/respond` | Verified nominee/current member | Role in same club | Nomination acceptance | Cannot respond for another nominee |
| POST `/api/organizations/:clubId/succession/:roleId/appoint` | Verified officer + accepted nominee | Role/club | Club officerIds/ownerId mutation **CRITICAL** | Owner handoff and candidate/actor membership race |

## Club project workspaces

| Route | Identity / allowed role | Club boundary | Sensitive fields / behavior | Cross-club risk or required safeguard |
|---|---|---|---|---|---|
| GET `/api/organizations/:clubId/projects` | Verified member | One club | Project list | No cross-club project IDs |
| POST `/api/organizations/:clubId/projects` | Verified officer | One club | New project and leadIds | Lead IDs must belong to club |
| GET `/api/organizations/:clubId/projects/:projectId` | Verified member | Club + project | Tasks, milestones, updates | All nested reads pair clubId/projectId |
| PATCH `/api/organizations/:clubId/projects/:projectId` | Verified officer or project lead; leadIds officer-only | Club + project | Project modifications | Lead privilege escalation |
| POST `/api/organizations/:clubId/projects/:projectId/milestones` | Verified officer/lead | Club + project | Milestone creation | Scope both IDs |
| PATCH `/api/organizations/:clubId/projects/:projectId/milestones/:milestoneId` | Verified officer/lead | Club + project | Milestone update | Forged nested ID |
| POST `/api/organizations/:clubId/projects/:projectId/tasks` | Verified member (self-assignment) or officer/lead | Club + project | Task/assignee | Validate foreign assignees/milestones |
| PATCH `/api/organizations/:clubId/projects/:projectId/tasks/:taskId` | Assigned member limited fields or officer/lead | Club + project | Task status/evidence, other fields privileged | Forged task IDs / assignment race |
| POST `/api/organizations/:clubId/projects/:projectId/updates` | Verified member (decision is lead/officer) | Club + project | Project notes/decisions | Forged project scope |
| GET `/api/organizations/:clubId/projects/:projectId/handoff` | Verified member | Club + project | Full tasks, evidence URLs and decisions | Portable document is private club data |

## Athene document intelligence

| Route | Identity / allowed role | Club boundary | Sensitive fields / behavior | Cross-club risk or required safeguard |
|---|---|---|---|---|---|
| POST `/api/projects/:projectId/athene/documents` | Verified Supabase member or legacy authenticator; officer | Single club ID as projectId | Uploaded documents + parse status **HIGH** | Require writer access before buffering |
| POST `/api/projects/:projectId/athene/initialize` | Same; officer | One club | Vector index metadata / setup | Privileged setup |
| POST `/api/projects/:projectId/athene/diagnostics` | Same; officer | One club | Model/index health | No credentials or document content |
| GET `/api/projects/:projectId/athene/documents` | Same; member | One club | Document metadata | Repository projectId predicate |
| GET `/api/projects/:projectId/athene/documents/:documentId` | Same; member | Club + document | Filename/processing metadata | Foreign document ID must return 404 |
| POST `/api/projects/:projectId/athene/documents/:documentId/reprocess` | Same; officer | Club + document | Reprocessed content/status **HIGH** | Foreign document denial |
| GET `/api/projects/:projectId/athene/insights` | Same; member | One club | Generated reports with citations **HIGH** | Report scoped to club |
| POST `/api/projects/:projectId/athene/insights` | Same; member | One club | New AI report + citations | Verify retrieval rows' projectId |
| POST `/api/projects/:projectId/athene/insights/:insightId/review` | Same; officer | Club + insight | Review mutation | Foreign insight denial |
| POST `/api/projects/:projectId/athene/query` | Same; member | One club | Retrieved chunks + AI citations **HIGH** | No out-of-club chunks / citations |
| POST `/api/projects/:projectId/athene/contributions/query` | Same; member | One club | Attribution + citations **HIGH** | No evidence from other club |

## Explicit 501 placeholders

| Route | Identity / allowed role | Club boundary | Sensitive fields / behavior | Cross-club risk or required safeguard |
|---|---|---|---|---|---|
| POST `/api/clubs/:id/sessions` | 501 placeholder | None | Not implemented | No writes |
| POST `/api/sessions/:id/attendance` | 501 placeholder | None | Not implemented | No writes |
| POST `/api/clubs/:id/contributions/drafts` | 501 placeholder | None | Not implemented | No writes |
| POST `/api/contributions` | 501 placeholder | None | Not implemented | No writes |
| PATCH `/api/contributions/:id` | 501 placeholder | None | Not implemented | No writes |
| POST `/api/clubs/:id/applications` | 501 placeholder | None | Not implemented | No writes |
| GET `/api/clubs/:id/bow` | 501 placeholder | None | Not implemented | No writes |
| POST `/api/connections` | 501 placeholder | None | Not implemented | No writes |

## Prioritized review findings (not fixed in PR 01)

1. **P0: Raw club rosters** in `backend/routes/read.js` and `workspace.roster` include full `members` records, potentially email/contact fields, privacy flags, and membership in other clubs. Return an explicit club-local projection.
2. **P0: Pending drafts** are currently readable by any club member and contain submitted evidence. Restrict the full review queue to current officers; let members access only their own requests.
3. **P0: Member profiles** return the target's entire multi-club contribution and attendance history when a caller shares *one* club. Only self should get complete private history; other club members should get a club-scoped, field-limited projection.
4. **P1: Consistent authorization**: reuse a verified request identity + freshly loaded `members` and `clubs`; never let `userProfiles.clubIds` or stored `officerIds` alone bypass current membership.
5. **P1: Legacy writes**: review, reject, invite and appoint must validate both actor membership and role immediately before mutations; validate candidate and invitation club scope, and cover revoked officers/invitees.
6. **P1: Athene**: keep `projectId` predicates on all reads, uploads, vector retrieval and citations; maintain separate member read / officer write permissions. Auth failures must be fail-closed even when upstream provider is unavailable.
7. **P2: Atomicity**: officer appointment and membership/invitation updates span multiple MongoDB documents. Consider transactions or recovery strategies, while preserving current happy-path contracts.

## Regression contract

- **401** unverified / missing identity; **404** nonexistent or foreign club/member/document to avoid enumeration; **403** known club but insufficient role; **409** stale/replayed writes.
- Test same-club member, other-club member, revoked member, cross-club record IDs, forged actor/member IDs, and accepted/rejected invitation flows.
- Protect private fields (`email`, `resume`, `authProviderUserId`, other club IDs, draft `source.excerpt`, raw attendance and review notes) by access controls and response allowlists.
- Public opt-in recruiter discovery and aggregate leaderboards remain usable without expanding private data.

## Verification

This inventory was extracted from `backend/app.js`, `backend/auth/supabase.js`, `backend/routes/{read,ledger,organizations,projects,planned}.js`, `backend/athene/{auth,routes,session}.js`, and `backend/services/workspace.js`. It also includes the dynamic loop routes for Athene query and explicit 501 placeholders. `npm run build` is the repository's `npm run check && npm test`; see the PR's GitHub Actions check for execution results.
