# Athene tenant security regression (Day 1 PR 05)

In the existing Athena API, `/api/projects/:projectId/athene` uses the **club ID** for `projectId`. Only current members of that club and university may read/query; only current club officers may upload/reprocess/review documents.

This PR adds a response-boundary guard: any document list/status, upload, generated insight or query that attempts to return records bearing a different `projectId` is denied with `ATHENE_SCOPE_ERROR`. Citation grounding also rejects retrieved chunks with foreign club scope, even if their quoted text is otherwise valid. New citations include an explicit `projectId`, and response checks reject a foreign `projectId` even inside nested insight citations. Historical saved reports without a citation `projectId` remain readable for compatibility; their report-level `projectId` is still verified. Empty search results recheck access after embedding.

`tests/athene-tenant.test.js` checks outsider and revoked-member denial, non-officer upload denial, same-club member query compatibility, and defense against a buggy service adapter returning another club's document/query/citation data. The existing `tests/athene.test.js` retains the happy-path document ingestion and RAG tests.

Run `npm run build`; GitHub Actions uses Node 24 and runs this command after `npm ci`. This guard supplements, and does not replace, MongoDB `projectId` predicates on storage/vector retrieval.
