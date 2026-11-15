# Athene API and team integration

Base: `/api/projects/:projectId/athene`. In this checkout `projectId` is an existing **club ID**, not the club's human-readable project label. All routes require `Authorization: Bearer <verified token>`. IDs are stable strings; new Athene document/chunk IDs are SHA-256 identifiers. See [setup](ATHENE_SETUP.md) for the auth adapter, setup and live demo.

| Method | Suffix | Request | Response data |
| --- | --- | --- | --- |
| POST | `/documents` | Multipart `files`, 1–5 PDF/DOCX/STEP/DXF files | `{ documents: AtheneDocument[] }` |
| GET | `/documents?before=<last-id>` | Optional pagination cursor | `{ documents, nextBefore }` |
| GET | `/documents/:documentId` | None | `AtheneDocument` |
| POST | `/documents/:documentId/reprocess` | None | `AtheneDocument`; unchanged ready content is reused |
| POST | `/query` | `{ "question": "Who implemented firmware?" }` | `AtheneAnswer` |
| POST | `/contributions/query` | `{ "person": "Darun", "question": "What work was completed?" }`; at least one field | `AtheneAnswer` with contribution review required |

Responses retain Ithaca's `{ data, meta }` convention; Athene meta is `{ mode: "atlas", fictional: false, feature: "athene" }`. Here `fictional:false` means live data mode, **not** a claim that uploaded text is true; the samples are fictional. Errors use `{ error: { code, message } }`. Consume typed interfaces from `backend/athene/contracts.d.ts`. Render response strings as text, never unsanitized HTML.

Upload returns 200 when all documents are ready/reused, 202 when another request owns processing, and 207 when at least one file failed processing. Always inspect each `documents[i].status` and `.error`. Status includes uploaded/processed timestamps, MIME type, byte size, content hash, uploader, model/dimensions, source locations, warnings and whether retry is appropriate. Failed ingestion remains inspectable. Raw files, full chunk text and embeddings are not exposed by list/status APIs.

An answer has this shape (illustrative IDs):

```json
{
  "projectId": "club-rocketry",
  "answer": "Darun implemented the battery monitor firmware. [src_<chunk-hash>]",
  "statements": [{
    "text": "Darun implemented the battery monitor firmware.",
    "person": "Darun",
    "attribution": "documented",
    "evidence": [{ "sourceId": "src_<chunk-hash>", "quote": "Darun implemented the battery monitor firmware state machine and CAN fault messages." }]
  }],
  "citations": [{
    "sourceId": "src_<chunk-hash>", "documentId": "<document-hash>",
    "chunkId": "<chunk-hash>", "filename": "01-firmware.pdf", "page": 1,
    "section": null, "score": 0.87
  }],
  "insufficientEvidence": false,
  "conflictingEvidence": false,
  "reviewRequired": true,
  "retrieval": { "engine": "mongodb-atlas-vector-search", "retrievedChunks": 6 }
}
```

`sourceId` is stable for a chunk. Page/section/filename/document IDs come exclusively from the database; the model supplies source IDs and exact quotes, which the server verifies. `statements` allow per-claim rendering and `documented` / `ambiguous` / `not_applicable` labels. Insufficient evidence can coexist with a supported partial answer. Conflicting evidence is surfaced with source-backed explanations; do not silently treat the response as a verified claim.

HTTP errors: 400 invalid input/multipart, 401 missing/invalid identity, 403 non-officer upload, 404 inaccessible/missing project or document, 413 oversized transport upload, 429 per-process admission limit (`Retry-After`), 502 invalid/ungrounded Gemini output, 503 disabled service/database/Gemini/index errors. Format and parsing errors within a bounded upload appear in 207 document statuses with codes such as `UNSUPPORTED_FILE`, `ENCRYPTED_FILE`, `INVALID_PDF`, `NO_TEXT`, `DOCX_EXPANSION_LIMIT`, or `PROCESSING_TIMEOUT`. The existing shared error middleware intentionally sanitizes server error messages; codes are stable enough for frontend recovery messaging.

## Reusable service interfaces

`createAtheneService({ db, config, repository, ai })` exposes:

```javascript
await service.upload(memberId, projectId, multerFiles);
await service.reprocess(memberId, projectId, documentId);
await service.list(memberId, projectId, before);
await service.status(memberId, projectId, documentId);
await service.query(memberId, projectId, question, contributionMode);
```

Each checks project access internally. `memberId` must come from verified shared authentication. `createAtheneRepository(db, config)` always uses the supplied shared connection; importing it creates no new client. `createAtheneGemini(config)` uses the existing official SDK dependency, with independent RAG prompts/schemas. Test dependency injection is explicit and is not selected via demo settings in production.

## Ledger boundary — proposed contract, not a new dependency

Ledger remains owner of `contributions`, drafts, approval, immutable evidence, audit and points. Athene writes none of these. The existing contribution records have `id`, `clubId`, `memberId`, `status`, `description`, `source.id`, `source.excerpt`, `approvedBy`, and `createdAt`. No authenticated Ledger read endpoint exists yet; the existing planned contribution write endpoints remain untouched.

When Sriram is ready, agree on a server-only adapter such as:

```typescript
type LedgerEvidence = {
  recordId: string; projectId: string; memberId: string;
  status: 'approved'; description: string;
  source: { id: string; excerpt: string };
  approvedBy: string; createdAt: string;
};
type LedgerEvidenceProvider = (input: {
  requestingMemberId: string; projectId: string; subjectMemberId?: string;
}) => Promise<LedgerEvidence[]>;
```

This is an integration proposal, **not implemented retrieval**. Map existing `clubId` to current `projectId`, enforce caller access and approved status in Ledger, and define a distinct `ledger:<recordId>` citation kind before adding records to RAG. Preserve source provenance and reviewer identity. Do not pass deleted/unapproved contributions, infer completion from attendance, copy point totals into an AI metric, or let document claims approve Ledger work.

## Bow, Court and frontend

- Frontend can call the six routes above and display source citations, processing errors, ambiguous claims and missing evidence; no frontend changes were made here.
- Bow/Court must preserve recruiter consent and candidate ownership restrictions. Current Athene APIs are club-member-only. Recruiter access requires a separately authorized, consent-filtered evidence adapter before it can be enabled. Do not proxy these routes with an officer credential to bypass that boundary.
- A future multi-project-per-club model needs a shared project-to-club authorization adapter and a migration of the current project scope. No speculative projects/users collections are introduced now.

## Merge surface

New modules are under `backend/athene`, new scripts are `scripts/athene-*` plus `scripts/check-syntax.js`, tests are `tests/athene*.test.js` and `tests/fixtures/athene`, and docs are `docs/ATHENE_*.md`.

Shared edits: `backend/app.js` mounts one router; `backend/config.js` composes Athene config; `backend/server.js` initializes only Athene ordinary indexes and updates its startup notice; `.env.example` adds feature variables; `package.json` and lockfile add `jose`, `fflate`, and `fast-xml-parser` plus scripts; README/API docs add links. The existing auth-less health field refers to the wider foundation, not a bypass of Athene auth. No frontend, Ledger/Bow/Court implementation, shared database schema, existing Gemini extraction, or source fixtures were changed.

Coordinate merges in app/config/server, package files and `.env.example` with Sriram and the other developers. Reuse the injected authentication contract when shared auth arrives. Athene has not been committed, pushed or merged by this implementation task.
