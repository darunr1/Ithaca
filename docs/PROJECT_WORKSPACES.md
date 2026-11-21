# Club project workspaces (beta)

This is the first usable vertical slice of Ithaca's real club-operations roadmap. It is **not** a complete production or self-hosting release. Projects are separate from the existing Athena/Athene document namespace; no migrations are applied to historical club records.

## Run against MongoDB Atlas

The feature is only mounted when `AUTH_MODE=supabase` and `DATA_MODE=atlas`; it relies on verified `req.memberId` from the existing Supabase identity middleware. Set up your Supabase credentials and Atlas database according to [SUPABASE_AUTH.md](SUPABASE_AUTH.md), then run:

```bash
npm ci
npm run db:setup
npm run dev
npm test
```

Review `database/definitions.js` and back up your database before running the setup command against an existing deployment. The new collection validators and indexes are installed idempotently, but `db:setup` also updates validators on existing collections. No project records are created by the setup command. `DATA_MODE=demo` remains a fictional, read-only board.

## Storage

| Collection | Contents |
| --- | --- |
| `clubProjects` | Club-owned projects, status, target, lead IDs and timestamps |
| `projectMilestones` | Scoped milestone titles, due dates and status |
| `projectTasks` | Scoped tasks, assignee IDs, due dates, evidence URLs and status |
| `projectUpdates` | Attributed progress, decision, blocker and meeting notes |
| `projectAuditLogs` | Basic append-only actor/action/record/time trail (not a cryptographic log) |

Every record carries a `clubId` and project-scoped records also carry `projectId`. Indexes lead with these keys. Authorization validates actual club membership server-side, and every item fetch/update uses the complete scope.

## API

All routes are under `/api/organizations/:clubId/projects`, use authenticated bearer requests, return `{ data: ..., meta: ... }` and reject unknown body fields.

| Method | Path relative to base | Action |
| --- | --- | --- |
| GET | `/` | List up to 200 projects in the current club |
| POST | `/` | Create project (club officer only) |
| GET | `/:projectId` | Read project, tasks, milestones, updates and derived summary |
| PATCH | `/:projectId` | Change metadata/status (officer or project lead); change lead IDs (officer only) |
| POST | `/:projectId/milestones` | Create milestone (officer/lead) |
| PATCH | `/:projectId/milestones/:milestoneId` | Change milestone (officer/lead) |
| POST | `/:projectId/tasks` | Create task (officer/lead can assign club members; members may only self-assign) |
| PATCH | `/:projectId/tasks/:taskId` | Officer/lead may edit task; assigned members may change only status and evidence URL |
| POST | `/:projectId/updates` | Add attributed progress, blocker or meeting note (club member); official decisions require an officer/lead |
| GET | `/:projectId/handoff` | Export derived Markdown handoff summary |

Example create:

```json
{
  "name": "Flight Computer Upgrade",
  "description": "Bring up sensors and validate the avionics pipeline",
  "targetDate": "2027-04-01",
  "leadIds": []
}
```

Task statuses: `todo`, `in_progress`, `blocked`, `done`. Project statuses: `active`, `on_hold`, `completed`, `archived`. Milestone statuses: `planned`, `in_progress`, `done`.

## Permission model

- Any authenticated club member may list/read that club's projects and create an attributed update.
- A club officer may create projects and change their lead IDs.
- Officers and project leads may create milestones and manage project tasks.
- Ordinary members can create self-assigned tasks, and update status/evidence for their assigned tasks only.
- Non-members receive 404 on club-scoped endpoints; IDs are not sufficient to gain access.
- No frontend control is trusted to authorize an API operation.

## Known limitations

- One-page API listing caps are 200 projects, 200 milestones, 500 tasks, 100 recent updates. Pagination and search are required for larger groups.
- Basic append-only audit writes are **not transactional** with task changes. A production release needs transactional change/audit operations and recovery semantics.
- No built-in task deletion, notifications, attachments, dedicated meeting scheduling, file storage, export of the entire organization, or real-time collaboration yet.
- Handoff export includes plain-text project information and links, not Athena document summaries.
- The current multi-club authorization implementation needs a wider independent security audit prior to real clubs storing sensitive information.
- The self-hosted Docker release, backup/restore workflow, and open-source license are still pending. **Do not represent this beta as a ready-to-deploy self-hosted release.**
