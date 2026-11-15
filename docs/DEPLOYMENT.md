# Vercel deployment and judging handoff

The Vercel function at `api/index.js` exports the existing Express application through a lazy serverless bootstrap. `backend/server.js` remains the local `npm start` entry point. `vercel.json` sends only `/api/*` to Express and serves the tracked HTML, CSS, and JavaScript modules from `frontend/`. Browser requests use same-origin `/api` URLs, so no CORS or second backend origin is required.

## Deploy read-only fictional mode first

Import `darunr1/Ithaca` in Vercel and use these project settings:

- Framework Preset: **Other**
- Root Directory: repository root (`.`)
- Install Command: `npm ci`
- Build Command: leave empty
- Output Directory: `frontend` (also enforced by `vercel.json`)
- Node.js Version: **24.x**; do not override it with 26.x
- Fluid Compute: enabled (recommended)

Set these Production environment variables explicitly for the first deployment:

```dotenv
DATA_MODE=demo
AI_MODE=mock
ATHENE_ENABLED=false
AUTH_MODE=demo
NODE_ENV=production
```

Do not set `ATHENE_DEV_TOKEN`, `MONGODB_URI`, `GEMINI_API_KEY`, or production authentication secrets in this phase. Deploy the fix branch to Preview first, then verify:

```powershell
$ithacaUrl = 'https://<preview-host>'
Invoke-RestMethod "$ithacaUrl/api/health"
Invoke-RestMethod "$ithacaUrl/api/clubs"
curl.exe -I "$ithacaUrl/"
curl.exe -I "$ithacaUrl/styles.css"
curl.exe -I "$ithacaUrl/app.js"
curl.exe -I "$ithacaUrl/shared/api.js"
curl.exe -I "$ithacaUrl/core/home.js"
curl.exe -I "$ithacaUrl/recruiting/court.js"
```

`/api/health` must say `mode: demo`, `fictional: true`, `database: disabled`, and `authentication: fictional-demo`. `/` is public and `/app` opens the explicitly labeled local demo workspace. This is an honestly labeled mode, not a fallback from a failed live service.

## Enable Atlas, Gemini, and production Athena

Run setup once from a trusted machine against the intended Atlas database. Never make seeding or index creation a Vercel build/start hook:

```powershell
npm run db:setup
npm run db:seed
npm run athene:setup
```

Then configure all of the following in Vercel Production (and separately in Preview if Preview should use live services):

```dotenv
DATA_MODE=atlas
MONGODB_URI=mongodb+srv://<restricted-app-user>:<url-encoded-password>@<cluster>/?retryWrites=true&w=majority
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
AUTH_MODE=clerk
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NODE_ENV=production
```

Configure verified email and Google login, production redirect URLs, and existing-member linkage exactly as described in [Clerk authentication and production setup](CLERK_SETUP.md). Never expose `CLERK_SECRET_KEY` or put `ATHENE_DEV_TOKEN` in Vercel. The Clerk publishable key is public by design and is the only Clerk key returned to the browser.

Use a restricted Atlas application user for only the intended database. Permit Vercel outbound connectivity in Atlas Network Access; a stable allowlist requires Vercel Secure Compute or another fixed-egress arrangement. Never put `ATHENE_DEV_TOKEN` in Vercel.

After live configuration, `/api/health` must report Atlas connected. Run `npm run ai:verify` from a trusted environment using the same key/model, then run the opt-in live integration test in `ATHENE_SETUP.md` with a real short-lived officer JWT. Atlas, Gemini, vector-index, and authentication failures remain visible; never switch a failed live deployment silently to demo.

## Vercel limits and local operation

`vercel.json` allows the API function 300 seconds, suitable for the currently bounded ingestion path on Fluid Compute/Hobby. Vercel limits function request and response bodies to 4.5 MB, so Athena accepts at most 4 MiB of combined multipart file data. Larger documents require direct object-storage upload and asynchronous processing; increasing Multer limits cannot bypass the platform gateway. A durable queue is required before production-scale concurrent ingestion.

Keep `backend/data/**` and `demo-data/**` in the function bundle; routes read those CSVs at runtime. Choose a Vercel function region close to Atlas if latency becomes material.

Node 24 LTS is the supported local runtime. `npm start` still runs `backend/server.js`, listens on `HOST`/`PORT`, and closes MongoDB on shutdown. Set `HOST=0.0.0.0` only on a conventional Node host; leave `HOST` and `PORT` unset in Vercel because it invokes the exported app directly.

## Exactly four targeted categories

| Category | Evidence the finished demo needs |
| --- | --- |
| HackUTA Main Track — The Odyssey | One coherent journey: home → guidance → evidence-backed recognition → opportunity → succession |
| Best Use of Gemini API | Real structured extraction plus role-fit explanation, exact evidence and officer review; disclose mock mode |
| Best Domain Name from GoDaddy Registry | Eligible registered name serving the working app over verified HTTPS |
| [MLH] Best Use of MongoDB Atlas | Real persistent attendance/contributions, unique duplicate protection, atomic audit and approval, aggregation-backed rankings |

No ElevenLabs or Vultr integrations. Confirm official track eligibility and how many categories can be entered; this document records the user's targets, not verified prize availability.

## Three-minute story after implementation

0:00–0:20: Aster Rocketry's knowledge should survive graduation. 0:20–0:50: record a session and attendance. 0:50–1:25: Athena drafts a firmware contribution from fictional notes. 1:25–1:45: another officer approves it; Atlas history and rankings update. 1:45–2:25: The Court shows the engineer's actual work and requests a consented connection. 2:25–2:50: Bow explains relevant successor experience and gaps; an officer chooses the next step. 2:50–3:00: close with knowledge passed forward.

The foundation currently demonstrates read-side screens and integration structure, not this full write loop. Prepare a labeled fallback dataset, backup video, README, Devpost description, source repository link, and tested live URL before submission.

Team deadline: November 14, 2026, 11:59 PM Central, unverified. [Official HackUTA](https://www.hackuta.com/) lists November 14–15; verify the actual cutoff with organizers/Devpost.
