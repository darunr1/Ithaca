# Contributing to Ithaca

Thanks for helping make student-club knowledge and progress easier to preserve.

**Status:** This repository contains an early beta, not a security-audited production release. Before an open-source release, the project copyright holders need to approve and add a license. Until then, do not assume the repository's source code is licensed for arbitrary redistribution.

## Local setup

Install Node.js 24 LTS and npm. Use `npm ci`, then `npm run dev`. Run `npm run build` before submitting a pull request. The default demo mode contains fictional people and records. For live Atlas access follow `docs/SUPABASE_AUTH.md`; never publish a credential.

## Proposed change workflow

1. Open an issue describing the student-club problem, expected workflow, and acceptance criteria.
2. Work on a feature branch; keep each PR focused on one coherent change.
3. Update API/schema/docs when changing an endpoint or data field.
4. Add tests for malformed input, unauthorized users, cross-club access and empty states.
5. Document setup, migrations and deployment/rollback steps.
6. Submit a PR with screenshots for UI changes and a checklist of tests run.

**Security boundaries:** never bypass club membership checks in a route; never send demo fixtures to live data, never commit personal student files, secret keys or auth tokens. AI output must be identified, traceable to permitted sources and reviewed by humans before consequential actions.

**Design principles:** works without AI, privacy by default, minimal burden on volunteers, readable historical records, good keyboard/mobile accessibility, and exportable club data. Please see `docs/ROADMAP.md`.
