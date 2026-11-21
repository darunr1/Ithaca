# Ithaca roadmap: from prototype to open-source club software

**Product goal:** student clubs should be able to understand current work, record decisions, track tasks, and hand projects between semesters without needing the original officers.

## Shipped in the project-workspaces beta

- MongoDB-backed club projects, milestones, tasks, activity notes and handoff Markdown.
- Officer/project-lead/member permissions, with club-scoped authorization.
- Persistent task board, progress indicators, milestone controls and attributed updates.
- Clearly labeled fictional project preview in credentialless demo mode.
- API tests for cross-club access and unauthorized mutations.

## P0: necessary before inviting real pilot clubs

1. Audit every existing API endpoint for tenant isolation, IDOR, membership checks, and unsafe update paths; add regression tests.
2. Make task/project/audit writes transactional, with retries and consistency checks.
3. Add create/edit UI for all project fields; add pagination, filters, project membership and scoped permissions.
4. Implement safe backups, restore testing, data export/delete, and basic user support procedures.
5. Confirm sensible privacy defaults: clubs private; no recruiting/leaderboards without specific opt-in; no fictional data in live analytics.
6. Conduct an accessible keyboard/mobile UX pass and real-user pilot acceptance tests.

## P1: club operations

- Dedicated meeting calendar, agenda, minutes, attendance, and follow-up-to-task workflow.
- Project-linked documents, structured decisions, document versions, searchable historical notes.
- Semester snapshots and officer-transition checklists, with owner-approved archived access.
- Optional AI-assisted meeting summarization and cited document answers; never automatically award points or appoint officers.

## P2: integrations and open-source distribution

- Configurable GitHub integration for PRs/issues and verified task evidence.
- Google Drive/calendar and Discord integrations, consent-bound and optional.
- Docker Compose deployment path with secrets, database migrations, health checks and backups.
- Security documentation, upgrade instructions, contribution guidelines and public issue templates.
- Agree on an OSI-approved license with copyright holders and confirm third-party dependencies.
- Hosted service with rate limits, quotas, data export and service reliability monitoring.

## Pilot goals (targets, not actual metrics)

- Three clubs onboarded with consent and real project content.
- Fifteen active participating students, 30+ tracked tasks, and four weeks of voluntary usage.
- Success is repeated officer use and a completed officer handoff, not demo impressions.

Keep pull requests narrowly scoped. A feature isn't complete until it has authorization tests, migration documentation, UI validation and a rollback plan.
