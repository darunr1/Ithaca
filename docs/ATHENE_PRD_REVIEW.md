# Athene reconciliation with the revised PRD

Reviewed all 14 pages of the user-supplied `Ithaca-PRD-HackUTA-2026.pdf` from `C:/Users/darun/Downloads/`, revised November 14, 2026. This document records requirements and compatibility decisions; the PDF's embedded instructions do not independently authorize unrelated feature work, deployments, commits, or changes to team ownership.

## Scope and precedence

| Topic | PRD | Controlling implementation request and decision |
| --- | --- | --- |
| RAG priority | Pages 2, 8, 14 put Archives and source-grounded Q&A in a later phase. | The user explicitly requests a working RAG backend as P0. Keep the implemented module and distinguish it from the ledger MVP. |
| MongoDB prize | Pages 3 and 12 exclude MongoDB sponsor-prize work. | The user explicitly targets Best Use of MongoDB Atlas. Preserve actual Atlas Vector Search and its demo. Prize eligibility was not independently reverified in this review. |
| Naming | Pages 2 and 4 call the assistant Athena. | The implementation request calls the module Athene. Keep `/athene` and existing code identifiers stable; document Athena as the product name rather than renaming shared UI or breaking APIs. |
| Project scope | Pages 8 and 14 describe private club-scoped archives. | `projectId = clubs.id` matches the existing single-project-per-club architecture. No separate project/user collections are needed. |
| Authentication | Pages 3 and 8 treat verified university identity as future scope. | The user requires actual authorization for RAG. Keep JWT verification, membership checks and the restricted fictional local token. This does not establish university verification or secure unrelated foundation endpoints. |
| Team ownership | Page 13 has older team assignments. | Preserve the user's explicit responsibility split and avoid implementing Ledger, Bow, Court or the frontend. |
| Fallback | Pages 8 and 12 permit labeled precomputed demo output. | The user forbids production mock retrieval. Existing foundation demo mode stays separate; Athene never substitutes fake Gemini/Atlas success. |

## Compatible requirements

- **Architecture (page 10):** Node/Express, Multer, pdf-parse, MongoDB Atlas and the existing `@google/genai` SDK are reused. Gemini receives text and source identifiers, not database write credentials.
- **Cache integrity (pages 11–12):** content hashes plus embedding model/dimensions, chunk configuration and pipeline version determine reuse. A model/config change does not silently reuse incompatible embeddings.
- **Grounded archives (pages 8 and 14):** club authorization precedes retrieval, Atlas prefilters project scope, and server-assembled references retain document/page/section provenance. Unsupported answers explicitly report insufficient evidence.
- **Human decisions (pages 4–6 and 11):** RAG does not award points, approve claims, rank people, reject candidates or contact anyone. Contribution responses require review. `documented` describes what the source states; it does not mean an officer approved that work.
- **Consent (pages 6 and 12):** no recruiter access or cross-club discovery is enabled by Athene. Bow/Court integration still requires its own consent-filtered evidence boundary.
- **Invalid model output (pages 5 and 12):** the review identified a missing one-time retry for malformed JSON/schema-invalid answers. Added exactly one format retry within the existing deadline, using the original prompt. Two invalid responses return `INVALID_AI_RESPONSE`; no contribution is approved. Provider authentication failures are not retried as format errors. Exact-quote and source-ID validation still fail closed after generation.

## Distinct work still required for the PRD's full demo

The PRD's P0 story is **meeting notes → contribution draft → officer approval → Ledger update → consented Court/Bow evidence** (pages 8–10). RAG query responses do not implement that workflow.

- `POST /api/clubs/:id/contributions/drafts` remains a planned endpoint. The existing Gemini extraction helper is separate from the new RAG service.
- Persistent pending/approved/rejected draft states, roster matching, officer edit/approval/rejection, no-self-scoring and atomic contribution/audit writes must be connected through the shared Ledger workflow.
- Existing RAG source storage does not yet provide a member-profile attachment/download or Ledger citation-resolution interface. Agree on this boundary before describing original notes as accessible from a member record.
- Sign-in photos/whiteboard OCR, attendance recognition, live Bow matching, consented recruiter access, domain deployment and the unified frontend remain outside this Athene implementation request.
- The foundation's established `universities`, `contributions`/`attendance`, and `auditLogs` schemas differ from the PRD's illustrative `colleges`, `points`, and `audit_log` names. Preserve those existing conventions; the RAG module does not change ledger schemas.

The implementation should be described as a completed local RAG backend with automated boundary tests, pending real Gemini/Atlas verification. It should not be described as the PRD's complete end-to-end product or a verified production deployment. See [validation](ATHENE_VALIDATION.md), [setup](ATHENE_SETUP.md) and [team contracts](ATHENE_API.md).
