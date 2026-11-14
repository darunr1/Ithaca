# Team ownership

| Owner / branch | Primary files | Independently implementable next task |
| --- | --- | --- |
| Darun / `feat/athena` | `ai-service/`, `backend/middleware/uploads.js` | Wire validated extraction into the draft route; persist original notes and source IDs; expose uncertainty and review errors. Add content-hash/model/schema-version cache only after the live flow works. |
| Sriram / `feat/ledger-api` | `backend/` except uploads, `database/` | Implement session and attendance writes, then transactional draft approval and audit; enforce membership, no-self-scoring, idempotency and officer checks. Implement applications/connections and acceptance next. |
| Vaibhav / `feat/core-ui` | `frontend/core/`, `frontend/styles.css` | Session/attendance forms, Athena edit/review UI, selectable member profiles and history. Consume contracts with fixture mocks while write endpoints are 501. |
| Teja / `feat/recruiting-demo` | `frontend/recruiting/`, `demo-data/`, `docs/DEPLOYMENT.md` | Court evidence detail and connection UI; Bow opt-in application and matching UI; expand fictional ecosystem, domain setup, deployment and three-minute story. |

Darun coordinates shared integration files: `package.json`, `package-lock.json`, `.env.example`, `frontend/app.js`, `frontend/index.html`, `frontend/shared/`, and `docs/API.md`. Propose shared changes in small PRs rather than editing these independently. CSS is Vaibhav-owned; Teja should use existing classes or coordinate recruiting styles.

## Integration order

1. Agree on contracts and string IDs. Use [api-examples.json](../demo-data/api-examples.json) for frontend mocks. Keep mock adapters explicit; never catch network failures and return fake successes.
2. Sriram builds session → attendance → manual contribution → audit → aggregation. Database transactions must commit entry, draft review, and audit together.
3. Darun connects notes → Gemini → validated pending drafts, with no scoring writes. Sriram owns persistence; Vaibhav owns review controls.
4. Teja connects consent-filtered Court reads and accepted connection flow, then Bow applications and evidence reasons. Maintain student opt-in and officer control.
5. Replace each disabled control only when its endpoint works, and update the capability table in `docs/API.md`. Run `npm test` before integration.

PRs should say what works, what is still mocked, and how it was checked. No real student data, unsolicited recruiter outreach, or unverified deployment claims.
