# API contract v0.1

Base: `/api`. JSON, camelCase, string IDs. All requests use same-origin URLs. `Content-Type: application/json` except the planned upload form. Success envelope:

```json
{"data": {}, "meta": {"mode": "demo", "fictional": true, "foundation": true}}
```

`mode` is `demo` or `atlas`. `fictional: true` is guaranteed for the fixture repository; `false` in Atlas means the repository does not assert provenance (seeded Atlas records are still fictional). `origin` on AI results is independently `mock` or `gemini`. Planned examples below are target contracts; **all planned routes currently return 501 and perform no write**.

Errors: `{"error":{"code":"VALIDATION_ERROR","message":"..."}}`. Implemented status codes: 400 validation/malformed JSON, 404 missing record/route, 500 internal or database read failure, 501 unfinished route, 503 failed health ping. Planned write errors: 403 unauthorized/self-scoring, 409 duplicate attendance/already-reviewed draft, 413 oversized file, 415 unsupported type, 422 invalid evidence or points. Never convert a failure into demo success.

| Method / route | Status | Owner |
| --- | --- | --- |
| GET `/health` | Implemented | Sriram |
| GET `/clubs` | Implemented | Sriram |
| GET `/clubs/:id/roster` | Implemented | Sriram |
| GET `/clubs/:id/sessions` | Implemented | Sriram |
| GET `/clubs/:id/drafts` | Implemented | Sriram |
| GET `/members/:id` | Implemented, internal development view | Sriram |
| GET `/clubs/:id/rankings?range=week\|semester\|all` | Implemented | Sriram |
| GET `/recruiter/profiles?clubId=...&skill=...` | Implemented, consent-filtered | Sriram |
| GET `/recruiter/profiles/:id` | Implemented, consent-filtered | Sriram |
| POST `/clubs/:id/sessions` | Planned / 501 | Sriram |
| POST `/sessions/:id/attendance` | Planned / 501 | Sriram |
| POST `/clubs/:id/contributions/drafts` | Planned / 501 | Darun + Sriram |
| POST `/contributions` | Planned / 501 | Sriram |
| PATCH `/contributions/:id` | Planned / 501 | Sriram |
| POST `/clubs/:id/applications` | Planned / 501 | Sriram |
| GET `/clubs/:id/bow?role=Avionics%20Lead` | Planned / 501 | Darun + Sriram |
| POST `/connections` | Planned / 501 | Sriram |

## Implemented read examples

Examples show `data` only; use the envelope above. Full reusable envelopes are in [`demo-data/api-examples.json`](../demo-data/api-examples.json). Additional optional fixture fields may appear; clients should ignore unknown fields.

`GET /health`:

```json
{"status":"ok","database":"disabled","ai":"mock","authentication":"not-implemented"}
```

`GET /clubs/club-rocketry/roster` → member array:

```json
[{"id":"member-leo","name":"Leo Marin","universityId":"uni-aster","clubIds":["club-rocketry"],"major":"Computer Engineering","year":3,"skills":["C firmware","CAN","Hardware validation"],"visibleToCompanies":true,"openToNewClubs":true}]
```

`GET /members/member-leo` → `{member, contributions, attendance}`. Example contribution:

```json
{"id":"contribution-1","clubId":"club-rocketry","universityId":"uni-aster","memberId":"member-leo","sessionId":"session-1","date":"2026-10-24","week":"2026-10-19","description":"Reproduced and fixed the CAN frame timeout in avionics firmware.","skills":["C firmware","CAN"],"level":"high","points":90,"status":"approved","approvedBy":"member-iris","source":{"id":"notes-1","title":"Sensor bench tests","excerpt":"Leo Marin: Reproduced and fixed the CAN frame timeout in avionics firmware.","fictional":true},"createdAt":"2026-10-24T20:00:00.000Z"}
```

`GET /clubs/club-rocketry/rankings?range=all`:

```json
{"range":"all","start":"0000-01-01","rows":[{"memberId":"member-leo","name":"Leo Marin","points":190,"rank":1},{"memberId":"member-iris","name":"Iris Vale","points":130,"rank":2},{"memberId":"member-sana","name":"Sana Reed","points":100,"rank":3}],"caveat":"Activity within this club; not a measure of engineering ability."}
```

`GET /recruiter/profiles?skill=CAN` → array of `{member, university, clubs, contributions}`. Member fields are allowlisted to `id`, `name`, `major`, `year`, `skills`, `universityId`, `clubIds`. No email or other contact details. Evidence is the approved contribution shape above. Specific hidden/nonexistent profiles return the same 404. Internal profile routes must not be used by recruiter UI.

## Planned writes — target JSON for frontend mocks

`actorId` / `reviewerId` are explicit **demo identity assertions**, not authentication. Sriram must resolve real actor identity from an authenticated session before any non-fictional use. Server-created `id`, `points`, `week`, timestamps, and approval status must never be trusted from client input.

### Create session

`POST /clubs/club-rocketry/sessions`:

```json
{"title":"Launch readiness review","date":"2026-11-14","actorId":"member-iris"}
```

Target 201 `data`:

```json
{"id":"session-new","clubId":"club-rocketry","title":"Launch readiness review","date":"2026-11-14","week":"2026-11-09","takenBy":"member-iris"}
```

### Attendance

`POST /sessions/session-new/attendance` records **one member per request**:

```json
{"memberId":"member-leo","actorId":"member-iris"}
```

Target 201 `data`:

```json
{"id":"attendance-new","sessionId":"session-new","clubId":"club-rocketry","memberId":"member-leo","date":"2026-11-14","week":"2026-11-09","points":10,"recordedBy":"member-iris"}
```

Validate club membership and officer access; duplicate `(sessionId, memberId)` returns 409. Do not increment an independent total.

### Generate contribution drafts

`POST /clubs/club-rocketry/contributions/drafts` supports a future JSON text input:

```json
{"sessionId":"session-4","actorId":"member-iris","notes":"Sana Reed documented sensor calibration steps for the next avionics team."}
```

Alternative planned multipart fields: `file` (text/plain or application/pdf, max 5 MB), `sessionId`, `actorId`. Persist source text/file before assigning `source.id`; do not accept a client-provided excerpt as independently verified evidence. Scanned PDFs and photos are out of scope for the initial route.

Target 201 `data`:

```json
{"origin":"gemini","reviewRequired":true,"drafts":[{"id":"draft-new","clubId":"club-rocketry","sessionId":"session-4","memberId":"member-sana","description":"Documented sensor calibration steps for the next avionics team.","skills":["Documentation"],"suggestedLevel":"low","source":{"id":"upload-new","excerpt":"Sana Reed documented sensor calibration steps for the next avionics team."},"uncertainty":"","status":"pending"}]}
```

AI service returns `memberName`, `sourceExcerpt`, `suggestedLevel`, and nullable `memberId`; the persistence adapter creates IDs and maps `sourceExcerpt` to `source.excerpt`. Pending/null matches require officer resolution. Drafts have no awarded points.

### Approve contribution

`POST /contributions`:

```json
{"draftId":"draft-new","reviewerId":"member-iris","memberId":"member-sana","level":"low","description":"Documented sensor calibration steps for the next avionics team.","skills":["Documentation"]}
```

For `level:"custom"`, include `customPoints:40`. Target 201 `data`:

```json
{"contribution":{"id":"contribution-new","clubId":"club-rocketry","memberId":"member-sana","sessionId":"session-4","date":"2026-11-14","week":"2026-11-09","description":"Documented sensor calibration steps for the next avionics team.","skills":["Documentation"],"level":"low","points":30,"status":"approved","approvedBy":"member-iris","source":{"id":"upload-new","excerpt":"Sana Reed documented sensor calibration steps for the next avionics team."}},"auditId":"audit-new","draftStatus":"approved"}
```

Approval must atomically claim the pending draft, check reviewer/club/member, calculate server-side points, preserve source evidence, and write an audit. No self-scoring. Manual contributions and off-session work need a reviewed source and the same validations; finalize that additional input contract with Sriram before implementing UI.

`PATCH /contributions/:id` planned request: `{"reviewerId":"member-iris","description":"Corrected description","level":"custom","customPoints":40,"reason":"Officer correction"}`. Target 200: `{"contribution":{...},"auditId":"audit-edit"}`. Append before/after snapshots; do not overwrite history.

### Bow application and matching

`POST /clubs/club-rocketry/applications`:

```json
{"memberId":"member-leo","role":"Avionics Lead","consent":true,"profile":"I can volunteer five hours per week."}
```

Target 201: `{"id":"application-new","clubId":"club-rocketry","memberId":"member-leo","role":"Avionics Lead","consent":true,"status":"pending"}`.

`GET /clubs/club-rocketry/bow?role=Avionics%20Lead` target 200:

```json
{"role":"Avionics Lead","origin":"gemini","reviewRequired":true,"candidates":[{"candidateId":"member-leo","strengths":[{"explanation":"Documented CAN firmware experience.","evidenceId":"contribution-1","sourceExcerpt":"Reproduced and fixed the CAN frame timeout in avionics firmware."}],"gaps":["Mentoring experience is not established."],"reviewRequired":true}]}
```

Only explicitly consented applications or eligible opted-in profiles, scoped to the university and role. No score-based automatic selection, rejection, or outreach.

### Recruiter connection request

`POST /connections`:

```json
{"companyId":"company-aegean","memberId":"member-leo","message":"We would like to learn about your avionics work."}
```

Target 201:

```json
{"id":"connection-new","companyId":"company-aegean","memberId":"member-leo","status":"requested","createdAt":"2026-11-14T22:00:00.000Z"}
```

Verify approved company and current member opt-in. Duplicate pending request returns 409. Return no contact details. Student acceptance/decline endpoints require a separate authenticated contract; requesting does not send an email or grant access.

## Court search and future profile integration

`GET /recruiter/profiles` accepts optional `name`, `skill`, `major`, `university`, `club`, `year`, and the existing exact `clubId` filter. Text filters are trimmed, case-insensitive literal substrings (maximum 80 characters); filters combine with AND. `year` is an exact current year of study, an integer from 1 through 4: Freshman, Sophomore, Junior, and Senior. The UI offers these four labels. Text fields offer styled, keyboard-accessible typing suggestions from opted-in discovery results; users can also enter custom text. Blank text filters are ignored. Skills search approved contribution skills, not self-reported member skills. Unknown or malformed parameters return 400.

Each result includes the existing allowlisted `member`, approved `contributions`, `university: {id, name} | null`, and `clubs: [{id, name}]`. Only opted-in members are returned, including for name searches. Missing academic information is displayed with a fallback. No contact details are exposed.

`frontend/recruiting/discovery.js` is the frontend service boundary. When user profiles are implemented, map their public real name to `member.name` and retain member IDs, academic fields, university/club references, and discovery consent. Update the repository/service behind this endpoint or the adapter without coupling the Court view to authentication or profile storage. Current records come from demo fixtures or Atlas; this feature does not create accounts.

### CSV suggestion catalogs

`GET /recruiter/discovery-options` returns `{major: string[], university: string[], club: string[]}` inside the standard envelope. Values are trimmed, deduplicated and sorted from `demo-data/engineering_majors.csv` (`Engineering_Major`) and `demo-data/College_Directory_20261114.csv` (`Name of Institution`). Clubs come from `demo-data/top_us_engineering_clubs.csv` (`Club / Organization Name`) and are combined with existing opted-in member clubs. Only names are exposed, not the remaining directory columns. Catalogs are cached until server restart. Replace these files with the same headers and restart to refresh them. These are reference suggestions, not member profiles; choosing one may yield no students. Existing opted-in academic values are also included by the UI. University searches support up to 200 characters. Each dropdown displays at most 12 matches; typing narrows the catalog.

### University state filter

`state` is an optional university-state filter on recruiter discovery. Like other text filters it is trimmed, case-insensitive, accepts partial state names up to 80 characters, and combines with all other filters using AND. Use full names from the suggestions rather than postal abbreviations. Universities store optional `state` as a full state name. Discovery exposes `university.state` (null when unavailable); unknown states do not match a state filter. Future profile integration should set this field on the university record, not expose home addresses. The fictional Aster University is in Texas. Existing Atlas university records need this field populated before they match a state filter.

`demo-data/us_states.csv` contains the 50 US states (`State,Abbreviation`). The discovery-options endpoint includes `state: string[]` from its State column. The Court uses the same styled, keyboard-accessible autocomplete and retains the four Freshman/Sophomore/Junior/Senior levels. CSV catalogs require a server restart after edits.
