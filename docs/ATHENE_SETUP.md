# Athene backend setup and demo

Athene is an Express module inside Ithaca, using the existing MongoDB connection and official `@google/genai` SDK. It has no frontend. Its production path calls real Gemini embeddings/generation and MongoDB Atlas `$vectorSearch`; there is no mock or local vector-search fallback. Unit tests replace those boundaries explicitly.

## Architecture and current scope

The checked-in architecture describes clubs with a single `project` label, `members.clubIds`, `members.universityId`, and `clubs.officerIds`. There is no projects collection, document store, or existing authentication implementation. Consequently **`projectId` currently equals the existing `clubs.id`** (for example `club-rocketry`). Members may query/list; club officers may upload/reprocess. The same authorization checks run in reusable services as well as routes.

The user subsequently supplied the 14-page revised `Ithaca-PRD-HackUTA-2026.pdf`, dated November 14, 2026. All pages have now been reviewed. The PRD places the Archives/RAG in P2 and excludes the MongoDB sponsor prize; the user's explicit implementation request promotes RAG to mandatory scope and targets Atlas Vector Search. That explicit request controls these conflicts. Existing club scope, evidence requirements, human approval, privacy and teammate ownership remain intact. See [PRD reconciliation](ATHENE_PRD_REVIEW.md) for page references and remaining integration work.

New data stays in `atheneDocuments`, `atheneChunks`, and `atheneFiles`. Raw uploads occupy separate BSON records limited to 5 MiB, below the MongoDB document size limit. This avoids introducing a second storage service. No member, club, contribution, draft, points, consent or audit schema was changed.

## 1. Install and configure Gemini

Use Node.js 22.13+ and npm from the repository root in PowerShell:

```powershell
npm ci
Copy-Item .env.example .env  # First setup only; do not overwrite an existing .env.
```

Create a server-side key in [Google AI Studio API keys](https://aistudio.google.com/apikey), select/create its Google Cloud project, and enable billing/quota if required for your account. Put the key in `.env`; never put it in frontend code, screenshots, or commits.

Model choices were checked against official documentation on November 14, 2026:

- `GEMINI_EMBEDDING_MODEL=gemini-embedding-001`: Google's [embedding documentation](https://ai.google.dev/gemini-api/docs/embeddings) still lists this text model. Use `RETRIEVAL_DOCUMENT` for chunks and `RETRIEVAL_QUERY` for questions; request 768 dimensions and normalize both for cosine similarity. The installed `@google/genai` 1.52.0 supports `models.embedContent`, `taskType`, `outputDimensionality`, batching, and request cancellation. Requests are grouped into at most 16 texts.
- `ATHENE_GEMINI_MODEL=gemini-3.5-flash-lite`: a configurable [stable model with structured output support](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite). Athene uses the same SDK and API key as the existing AI module. This separate model setting avoids changing teammate RAG workflows. The foundation defaults to the current GA `GEMINI_MODEL=gemini-3.8-flash`; the retired `gemini-2.5-flash` endpoint is not a valid deployment default.

Documentation compatibility is **not** proof that your key can access either model. The live integration test below is the actual account-specific verification. Switching to a different embedding family may require adapting task settings; changing embedding model, dimensions or chunk settings requires reprocessing documents. Changing dimensions also requires updating the Atlas index.

## 2. Configure MongoDB Atlas

1. In [MongoDB Atlas](https://cloud.mongodb.com/), create a project and a cluster supporting Atlas Vector Search. Choose a region close to the backend.
2. Under **Database Access**, create a database user. Give the application read/write access to the intended database. The setup operator also needs collection/index creation and search-index management permissions; consult [Atlas database roles](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/). Use separate restricted application credentials for a production deployment.
3. Under **Network Access**, allow your current development IP and later the backend's outbound IP. Avoid unrestricted network access.
4. Choose **Connect → Drivers → Node.js**, copy the `mongodb+srv` URI, and replace the username/password placeholders. URL-encode special characters in the password.
5. Use a fictional database such as `ithaca_demo` for this shared foundation. Existing unrelated foundation routes are still unauthenticated; Athene does not retrofit teammate routes.

Set these values in `.env`:

```dotenv
HOST=127.0.0.1
PORT=3000
DATA_MODE=atlas
MONGODB_URI=mongodb+srv://<username>:<url-encoded-password>@<cluster>/?retryWrites=true&w=majority
MONGODB_DB=ithaca_demo
AI_MODE=live
GEMINI_API_KEY=<your-key>
ATHENE_ENABLED=true
ATHENE_GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
MONGODB_VECTOR_INDEX=athene_chunks_vector
ATHENE_CHUNK_SIZE=1400
ATHENE_CHUNK_OVERLAP=200
ATHENE_TOP_K=6
ATHENE_MIN_SCORE=0.65
```

## 3. Configure identity

**Local fictional demo:** generate a random token and copy its output into `ATHENE_DEV_TOKEN` in `.env`:

```powershell
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
```

```dotenv
ATHENE_DEV_TOKEN=<generated-random-token>
ATHENE_DEV_MEMBER_ID=member-iris
NODE_ENV=development
```

This token is accepted only from a loopback socket, with a loopback HOST, non-production NODE_ENV, and database name ending `_demo`. It represents the existing seeded officer `member-iris`; it does not create a user or grant access to another club. Do not expose this configuration through a reverse proxy or public tunnel. The seeded project's documents use fictional versions of team names as text; that does not create members or assert real achievements.

**Shared production authentication:** leave `ATHENE_DEV_TOKEN` empty. For a controlled hackathon browser demo, configure a high-entropy access-code hash and signed session:

```dotenv
AUTH_SESSION_SECRET=<32+ random characters, separate from the access code>
AUTH_ACCESS_CODE_SHA256=<SHA-256 hex digest of the high-entropy access code>
AUTH_SESSION_MEMBER_ID=<existing officer members.id>
NODE_ENV=production
```

The plaintext access code is entered in the Athena page and is never stored in Vercel or browser storage. Successful exchange creates an eight-hour `Secure`, `HttpOnly`, `SameSite=Strict` cookie. Atlas membership and project/officer authorization still run on every request. This is intended for a small trusted demo audience; use an identity provider for public multi-user deployment.

For an external identity provider, configure instead:

```dotenv
AUTH_JWKS_URL=https://<identity-provider>/.well-known/jwks.json
AUTH_ISSUER=https://<expected-issuer>
AUTH_AUDIENCE=ithaca
NODE_ENV=production
```

Athene verifies RS256/ES256 bearer JWTs, issuer, audience, signature, expiration and issued-at (maximum token age one hour). The authenticated `sub` must map to an existing `members.id`. No signup, password database, or session store is introduced. When shared authentication is implemented, inject `authenticate(req) => Promise<memberId>` through `createApp({ config, db, athene: { authenticate } })`; that adapter must verify identity, not trust `x-user-id`, request bodies, role labels, or frontend selections. Production startup still requires the documented auth configuration. Shared recruiter/consent access is future integration, not a membership bypass.

## 4. Initialize collections and the vector index

For a new fictional foundation database:

```powershell
npm run db:setup
npm run db:seed
npm run athene:setup
```

`db:setup` installs the existing foundation validators; review it before targeting an existing database. `athene:setup` touches only Athene collections and indexes, creates the configured vector index if absent, and refuses a mismatched definition instead of silently replacing it. Server startup ensures ordinary Athene indexes exist, but does not create/rebuild the Atlas search index.

In Atlas, select database `ithaca_demo`, collection **atheneChunks**, Search/Vector Search indexes, and create a **Vector Search** index named **athene_chunks_vector** with this exact JSON (or use the setup command above):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "projectId" },
    { "type": "filter", "path": "profile" }
  ]
}
```

Wait until the index is **READY** and **queryable**. The service checks its actual dimension, metric, filter fields and state on retrieval. Missing/building indexes return `VECTOR_INDEX_NOT_READY`; mismatches return `VECTOR_INDEX_MISMATCH`, both HTTP 503. See [MongoDB's vector query documentation](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-stage/). No empty fallback masks an index failure.

## 5. Start and demonstrate

```powershell
npm start
```

In another PowerShell terminal:

```powershell
npm run athene:samples
npm run athene:demo
```

The demo reads `.env`, uploads all five sample artifacts, prints their persisted status, then asks about Darun's completed and planned firmware work. It uses the real API and stores documents in Atlas. Repeat the command after indexing catches up; unchanged uploads reuse embeddings. `ATHENE_TEST_PROJECT_ID` defaults to `club-rocketry`; a JWT demo can use `ATHENE_TEST_BEARER_TOKEN` instead of the local token. These two optional variables are shared with the integration test.

Manual requests (PowerShell; substitute your local token without saving it to version control):

```powershell
$atheneToken = '<your-bearer-token>'
$atheneRoot = 'http://127.0.0.1:3000/api/projects/club-rocketry/athene'
curl.exe -H "Authorization: Bearer $atheneToken" -F 'files=@tests/fixtures/athene/01-firmware.pdf;type=application/pdf' -F 'files=@tests/fixtures/athene/02-battery-review.docx;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document' "$atheneRoot/documents"
Invoke-RestMethod -Uri "$atheneRoot/documents" -Headers @{ Authorization = "Bearer $atheneToken" }
Invoke-RestMethod -Method Post -Uri "$atheneRoot/query" -Headers @{ Authorization = "Bearer $atheneToken" } -ContentType 'application/json' -Body (@{ question = 'Who worked on the battery monitor firmware?' } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$atheneRoot/contributions/query" -Headers @{ Authorization = "Bearer $atheneToken" } -ContentType 'application/json' -Body (@{ person = 'Darun'; question = 'Which work is completed and which is only planned?' } | ConvertTo-Json)
```

Inspect documents or retry a failure using the returned `id`:

```powershell
$atheneDocumentId = '<returned-document-id>'
Invoke-RestMethod -Uri "$atheneRoot/documents/$atheneDocumentId" -Headers @{ Authorization = "Bearer $atheneToken" }
Invoke-RestMethod -Method Post -Uri "$atheneRoot/documents/$atheneDocumentId/reprocess" -Headers @{ Authorization = "Bearer $atheneToken" }
```

Sample documents cover firmware, battery thresholds, Python telemetry, event persistence, documentation, collaboration, ambiguous attendance/authorship, planned balancing work, and a conflicting draft threshold. STEP contains header metadata only, not parsed geometry.

## 6. Verify the Atlas component for judging

In Atlas Data Explorer, inspect `atheneDocuments` using `{ projectId: "club-rocketry" }`: five ready documents, uploader IDs, MIME types, processing metadata and source locations. Inspect `atheneChunks` with the same filter: text, stable chunk IDs, profile, source page/section, model and **768-element embedding arrays**. Original files are in `atheneFiles` and are never returned by list/query endpoints.

In mongosh, connected to your database:

```javascript
db.atheneChunks.getSearchIndexes("athene_chunks_vector")
db.atheneChunks.aggregate([
  { $match: { projectId: "club-rocketry" } },
  { $project: { _id: 0, chunkId: 1, documentId: 1, embeddingModel: 1, dimensions: { $size: "$embedding" }, page: 1, section: 1 } }
])
// Reuse a stored vector solely to demonstrate actual Atlas retrieval:
const specimen = db.atheneChunks.findOne({ projectId: "club-rocketry" });
db.atheneChunks.aggregate([
  { $vectorSearch: { index: "athene_chunks_vector", path: "embedding", queryVector: specimen.embedding,
      filter: { projectId: specimen.projectId, profile: specimen.profile }, numCandidates: 120, limit: 6 } },
  { $project: { _id: 0, documentId: 1, chunkId: 1, page: 1, text: 1, score: { $meta: "vectorSearchScore" } } }
])
```

The API additionally joins each chunk to a ready document's active ingestion generation. Point judges to `backend/athene/repository.js` for the actual production `$vectorSearch` pipeline. Responses expose `retrieval.engine`, retrieved chunk counts, relevance scores, source IDs and server-assembled citations. These metadata fields alone are not proof of live integration; inspect Atlas and run the live test.

## 7. Tests and verification

```powershell
npm test
npm run test:athene
npm run check
npm audit --omit=dev
```

The repo has no ESLint or TypeScript toolchain. `check` runs Node syntax checks across backend, AI, database, scripts and tests. Runtime input/output contracts use Zod; `backend/athene/contracts.d.ts` supplies consumer types. Unit tests use real PDF/DOCX/CAD parsers, HTTP requests and JWT crypto; Gemini and database unit boundaries are mocked. A refused-loopback MongoDB connection test uses the actual driver. None proves that external credentials or services work.

After completing setup and waiting for the Atlas index:

```powershell
$env:ATHENE_INTEGRATION = 'true'
npm run test:athene:integration
Remove-Item Env:ATHENE_INTEGRATION
```

The opt-in test requires a `_demo` database and a bearer token with officer access to `ATHENE_TEST_PROJECT_ID`. It starts its own local HTTP listener, uploads uniquely tagged versions of all five artifacts, checks persisted vector dimensions, waits up to 90 seconds for real Atlas retrieval, calls Gemini for a contribution answer, verifies citations against stored chunks, and cleans only its own documents/files/chunks. It does not drop collections, remove indexes, alter members, or seed silently. It incurs real Gemini requests. When explicitly opted in, absent credentials or failed service calls fail the test; without opt-in it reports a skip.

## Operational limits and tradeoffs

- One to five files per request, 5 MiB each; projects can have more than five documents. Listings paginate by `before` with at most 100 results. Filename/MIME and file signatures/structure are checked; unsupported/malformed/empty/encrypted files persist a readable failed status when the upload fits transport limits. Oversized/malformed multipart requests fail before persistence.
- PDF extraction retains page numbers but does not OCR scans. DOCX supports standard heading styles and body/table paragraphs; no invented page numbers, images, headers or footers. Textual STEP extracts FILE_DESCRIPTION/FILE_NAME/FILE_SCHEMA only. ASCII DXF extracts header values and comments. CAD metadata does not prove who did engineering work; native CAD, DWG/STL and binary formats are rejected.
- Parsing runs in an isolated worker (30 seconds, 256 MiB old-generation heap); extracted text is limited to 200,000 characters and 500 chunks. Worker limits are resource guardrails, not a hardened operating-system sandbox. Use container isolation if accepting hostile public uploads.
- Ingestion is synchronous and bounded to 180 seconds per upload request; query work uses a 90-second deadline. SDK requests have 30-second timeouts and at most two retries with jitter for transient status codes. A malformed or schema-invalid generated answer receives one additional generation attempt from the original prompt, within the same overall deadline; a second invalid answer fails with `INVALID_AI_RESPONSE` and requires human review. No model output is approved or persisted as a contribution. Configure reverse-proxy response timeout above 210 seconds for uploads. There is no durable background queue yet. Disconnects do not acknowledge success early; status can be polled separately.
- A four-minute database lease prevents concurrent processing; interrupted runs become retryable after expiry. Activation is fenced by the lease and happens only after all chunks persist. Partial chunks are never retrievable. Retry reuses same-profile embeddings, then removes observed old generations after successful activation; an interrupted cleanup can leave invisible rows until a later processing run or administrator cleanup. An unchanged ready document is returned without starting another run. Stable document identity is project + byte-content hash; a renamed exact duplicate keeps the original filename/uploader. Semantically identical files with different bytes are different uploads.
- Request admission allows two active POSTs per process and 20/minute/member, before upload buffering. Multi-instance deployments need shared rate limits and a durable queue. Configure a request-body limit at the gateway as well.
- Atlas indexing is eventually consistent. A ready document means vectors were persisted, not that search nodes have caught up. Empty/low-scoring retrieval yields explicit insufficient evidence. The default 0.65 cosine score cutoff is a starting heuristic, not a calibrated confidence metric; tune with project evaluation data.
- Citations are assembled from retrieved metadata, and exact quoted evidence is validated. This blocks invented references, not every possible semantic misinterpretation. Human review remains necessary for contribution claims. `documented` means a source states completed work, not independently verified ownership. No points, rankings, achievement percentages or approvals are produced.
- No retention/delete API is introduced; raw source retention and administrative cleanup policy must be agreed before storing real personal documents. Existing foundation routes still need the team's shared authorization work.
