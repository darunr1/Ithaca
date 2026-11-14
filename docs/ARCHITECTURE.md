# Architecture and invariants

```text
frontend/core (Vaibhav)        frontend/recruiting (Teja)
                frontend/shared/api.js
                         |
                Express route modules
                         |
                  workspace services
                         |
                  repository interface
                    /           \
         explicit demo fixtures  MongoDB Atlas

Future draft route -> upload/text extraction -> Gemini service
                    -> validate -> pending draft -> officer review
                    -> atomic contribution + draft + audit transaction
```

Same-origin HTML/CSS/ES modules keep setup small. No frontend framework or build tool. Atlas is the intended persistent store; fixtures are a separately selected read-only development mode. IDs are stable strings in the public `id` field; MongoDB `_id` remains internal. Use `crypto.randomUUID()` for new records, not sequential IDs. `universityId` is the canonical name (the PRD also used `collegeId`). `auditLogs` is the canonical audit collection name.

## Collection map

| Collection | Purpose / references |
| --- | --- |
| universities | Name, club-local timezone, semester start |
| clubs | University, project, authorized officer member IDs |
| members | University, club memberships, skills; both discovery flags false for newly created members |
| sessions | Club, local calendar date, Monday week key, recorded-by officer |
| attendance | One member/session record, exactly 10 points |
| contributions | Approved/deleted technical work, member, date/week, level, points, immutable source excerpt, reviewer |
| drafts | Pending/approved/rejected proposals; unresolved member IDs may be null; no points |
| auditLogs | Entry, action, reviewer, timestamp, before/after snapshots |
| applications | Voluntary member application for a specific club role; explicit consent |
| companies | Fictional recruiter organization and approval status |
| connections | Company/member request and acceptance state; no contact disclosure before acceptance |

Validators and indexes are in `database/definitions.js`. MongoDB does not provide foreign keys: the future write services must check reference existence, member club membership, reviewer permissions, and matching session club. Database validators cannot provide authenticated identity or verify that an officer belongs to a referenced club.

## Scoring

Attendance = 10 once per session/member. Low = 30, medium = 60, high = 90. Custom = integer 10–100 divisible by 10. A member can receive attendance and separate contributions for the same session. Off-session contributions omit `sessionId`.

Use ISO local calendar dates (`YYYY-MM-DD`) and Monday–Sunday weeks in the university timezone, not execution-host timezone. Timestamps (`createdAt`) use UTC ISO strings. The demo ranking clock is fixed to November 14, 2026; Atlas uses the current university-local date. Semester starts at the university's configured date. The initial ranking includes active approved contributions and attendance, including future-dated records if inserted; write validation should reject unintended future activity dates.

Instead of duplicating the PRD's suggested `points` collection, this foundation derives one ledger from the required `attendance` and `contributions` collections. `leaderboardPipeline` uses `$unionWith`, `$group`, `$setWindowFields` / `$rank`, and a member join. Ties share rank. Members with no entries do not appear in rankings. No copied member totals can drift from source records. Drafts and deleted contributions never count. `memberHistoryPipeline` returns approved evidence in reverse date order.

Attendance has a unique compound `(sessionId, memberId)` index. Contribution validators enforce preset/custom points and prohibit self-approval. Future writes must also use `validateReviewer`, validate membership and session ownership, and append audit logs atomically. Duplicate attendance must return 409, not award another 10. Approval should atomically compare pending draft status to prevent double awards; a unique partial `draftId` index should be added with that workflow. Audit preservation and transaction writes are planned, not demonstrated by this scaffold.

## AI boundary

Gemini has no repository or write credentials. Strict schemas prohibit extra fields such as awarded points. The service validates exact source substrings, member ID/name consistency, and named attribution. Ambiguous matches remain null. Role-fit strengths must cite candidate-owned approved contribution or submitted-profile evidence; role-fit output has no selection or contact action. Retry at most once; then require manual review.

PDF/text ingestion is prepared in `backend/middleware/uploads.js`; its route remains 501. Before wiring it, add officer access checks, per-user rate limits, secure source storage, and source retention. Handwriting, photo recognition, general RAG, and resume upload workflows are future scope.

## Privacy and current limits

Recruiter endpoints filter consent before returning profiles, use a public field allowlist, omit contact fields, and search only approved evidence skills. Hidden profile IDs return the same 404 as nonexistent IDs. Internal member/roster routes are **not authorized** in this foundation. A client can reach them, so do not mistake the public projection for production privacy. All deployment demos must contain fictional data only until authenticated roles and tenant isolation protect every route.

Consent defaults are enforced by the future member-creation service; current validators require explicit booleans. Company verification, application withdrawal, invitation, and connection acceptance must be checked server-side when implemented. Bow's display is a labeled static example. No system sends messages or automatically rejects candidates.
