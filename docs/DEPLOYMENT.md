# Deployment and judging handoff — Teja

Deployment is prepared, not performed. No domain has been registered or verified.

## Quick path

Use a Node web-service host that supports the pinned Node dependencies and outbound Atlas connections. A single Express process serves static files and API routes; no separate static hosting is required.

1. Connect the shared GitHub repository to the chosen Node host. Build: `npm ci`. Start: `npm start`. Runtime: Node 22.13+.
2. Set `HOST=0.0.0.0`; use the platform-provided `PORT`. Set secrets through the host's environment UI, never Git. Use only the fictional demo dataset while authorization is absent.
3. For a read-only fallback use `DATA_MODE=demo`, `AI_MODE=mock`. For Atlas judging set `DATA_MODE=atlas`, configure the URI/database and IP access, and seed the `_demo` database once from a trusted terminal. Seed is not a start/build hook.
4. Set `/api/health` as the health check. Confirm Atlas reads and aggregations; simulate a failed connection and confirm an explicit error. Do not replace failures with mock success.
5. Register an eligible GoDaddy Registry domain after verifying the event offer. The PRD's promo code is unverified. Use the exact DNS records supplied by the chosen host. Confirm HTTPS and the final domain from another device before claiming deployment.
6. Keep the local `.env` configured for demo fallback, with a separate secure record of live settings. Run the same code locally for judging if connectivity fails; visibly identify fallback mode.

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
