# Foundation validation

Run `npm test` to repeat the Node test suite. It uses an ephemeral loopback HTTP server and no external credentials.

Verified locally:

- Credentialless Express startup and `/api/health` response.
- HTML, CSS, and JavaScript served successfully over HTTP.
- All five frontend view functions execute against actual backend reads; weekly ranking and evidence search render the expected values.
- Scoring limits, Monday week boundaries, no-self-scoring helper, and fictional fixture consistency.
- AI exact-excerpt validation, roster attribution, prohibition of model-awarded points, consent and candidate-owned role-fit evidence.
- Text ingestion and rejection of empty notes/bogus PDF signatures.
- Consent filtering, public field allowlist, hidden-profile 404, and evidence skill search.
- Missing database/key configuration rejects explicit live modes; simulated Atlas failure never returns fixtures.
- Database setup installs definitions for 11 collections and includes the unique attendance index (mock database installation check).
- Planned writes return 501; malformed JSON and invalid ranking ranges return 400.
- Git ignores `.env`, secret environment variants, and uploads, while keeping `.env.example`.

`npm install` reported zero known vulnerabilities at setup. The lockfile records exact resolved dependencies.

Not verified here: real Atlas connection/validator execution/aggregation, real Gemini response, visual browser screenshots or responsive layout in a browser, DNS/HTTPS deployment, or the full write workflow. No Atlas or Gemini credentials were available. `npm run ai:verify` reported an explicit skip. No supported browser tool or installed Chrome/Edge executable was available; frontend checks executed the view modules and HTTP assets, not a browser DOM.

Before judging, use a real Atlas demo database, run `db:setup` and `db:seed`, verify actual duplicate-key behavior and aggregation results, then finish and test the transactional write loop. Review desktop/mobile layouts in a browser and configure the domain. These are implementation follow-ups, not completed foundation claims.
