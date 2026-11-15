# Ithaca

**Where engineering legacies live on.** A modular HackUTA 2026 foundation for four developers: Ithaca Home, Athena, Kleos Ledger, The Court, and Bow.

This is an initial foundation, not the complete hackathon product. All bundled identities, organizations, meetings, and evidence are fictional.

**Athena backend:** project-document ingestion, Gemini RAG and MongoDB Atlas Vector Search are available as an opt-in backend module. See [Athena setup and demo](docs/ATHENE_SETUP.md) and [API/team contracts](docs/ATHENE_API.md). Contribution proposals and approvals belong to the Kleos Ledger; Athena answers from uploaded project sources. In production, the shared Supabase identity and Atlas authorization protect Athena and the rest of the workspace.

**Production authentication:** the public landing page and Supabase-protected workspace are documented in [Supabase production setup](docs/SUPABASE_AUTH.md). `AUTH_MODE=demo` keeps the explicitly fictional local workflow; production uses `AUTH_MODE=supabase` with Atlas-backed profiles and authorization.

## Run locally

Use Node.js 24 LTS and npm. The major is pinned because the optional PDF stack is runtime-sensitive.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open **http://127.0.0.1:3000**. Express serves both the frontend and `/api`, so no separate frontend server, build step, or CORS configuration is needed. `npm start` runs without watch mode. No credentials are required for demo mode. Fonts have local system fallbacks if offline.

```powershell
npm test
npm run ai:verify
```

`ai:verify` skips explicitly when no key is present. With a key, it sends one fictional note and validates Gemini's structured response (one retry is permitted). Never put API keys in frontend files.

## What works now

- Responsive five-page vanilla HTML/CSS/JS shell, with distinct core and recruiting modules.
- Live frontend-to-backend reads: health, clubs, roster, sessions, drafts, member histories, rankings, and consent-filtered recruiter discovery. Skill search uses approved contribution evidence.
- Explicit read-only fictional demo mode and an Atlas repository using the same response shape.
- Atlas setup/seed commands, 11 collection validators, unique attendance index, ranking and history aggregation pipelines.
- Gemini SDK service functions, strict JSON schemas, source/roster checks, role-fit evidence checks, retry, and explicit mock behavior.
- Scoring helpers and an upload/PDF extraction utility ready to wire into future routes.

**Not implemented:** session or attendance writes, transactional multi-document audit writes, applications, live Bow matching, connection acceptance, OCR, or a registered domain. Planned API routes return HTTP 501. Disabled buttons and Bow's static example are labeled. Demo identities remain limited to explicit fictional local mode; production authorization uses verified Supabase identities and Atlas records.

## Connect MongoDB Atlas

Create an Atlas cluster and database user, allow your development/hosting IP in Atlas Network Access, then set in `.env`:

```dotenv
DATA_MODE=atlas
MONGODB_URI=mongodb+srv://<user>:<url-encoded-password>@<cluster>/?retryWrites=true&w=majority
MONGODB_DB=ithaca_demo
```

```powershell
npm run db:setup
npm run db:seed
npm run dev
```

Setup installs or updates strict validators and indexes. Review these definitions before running against an existing database. Seed requires a database name ending in `_demo`, inserts fictional records only if their IDs do not exist, and never deletes or overwrites existing records. The current frontend is scoped to the seeded `club-rocketry` workspace; a club selector is a next task.

In Atlas mode, **all implemented reads use Atlas**, including aggregation for activity rankings and contribution histories. The health endpoint pings Atlas. Missing credentials or initial connection failure stop startup; later database failures return errors. No automatic switch to fixtures occurs. For judging, show the seeded Atlas collections and unique attendance index, then implement and demonstrate the transactional approval loop. The scaffold alone is not a complete Atlas prize demo.

## Configure Gemini

```dotenv
AI_MODE=live
GEMINI_API_KEY=<server-side-key>
GEMINI_MODEL=gemini-3.8-flash
```

Verify that the configured model is available to your key, then run `npm run ai:verify`. The model is configurable; the supplied name is a starting default, not an availability guarantee. The foundation uses the official `@google/genai` SDK and `responseJsonSchema`; see [Google's structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

`AI_MODE=mock` performs no extraction and returns labeled empty results; the UI's precomputed draft is separate fictional data. Real AI failures are surfaced for manual review and never replaced by fabricated success. Source-quote validation is a guardrail, not proof that a model's interpretation is correct. Human review remains mandatory.

## Work together

- [Team ownership and next tasks](docs/TEAM.md)
- [API contracts and request/response examples](docs/API.md)
- [Data model, invariants, and architecture decisions](docs/ARCHITECTURE.md)
- [Deployment and four-prize demo plan](docs/DEPLOYMENT.md)
- [Reusable JSON mock responses](demo-data/api-examples.json)

The lockfile is tracked. Coordinate dependency changes through Darun. Develop on separate branches and keep route/field changes coordinated through `docs/API.md`.

## Deadline and source precedence

Your pasted setup request overrides the PRD's old prize exclusions and ownership assignments. Target exactly **HackUTA Main Track — The Odyssey**, **Best Use of Gemini API**, **Best Domain Name from GoDaddy Registry**, and **[MLH] Best Use of MongoDB Atlas**. No ElevenLabs or Vultr integration is included.

The team target is **November 14, 2026, 11:59 PM America/Chicago**. On November 14, the [official HackUTA page](https://www.hackuta.com/) and [UTA event listing](https://events.uta.edu/event/hackuta-9401) confirmed a November 14–15 event, but did not establish that exact submission cutoff. Treat it as an unverified team deadline and confirm with organizers/Devpost; do not infer the cutoff from the event date.

The pasted request ends mid-sentence at “Environment secrets are excluded from version”. This foundation interprets that as version-control exclusion and verifies the ignore rules. The full 14-page attached PRD was reviewed before implementation.
