# Project workspace data integrity

Baseline: seven mutating routes in `backend/routes/projects.js` perform the primary write first, then `changeLog` launches two independent writes in parallel.

| Mutation | Primary write | Subsequent independent writes |
| --- | --- | --- |
| Create project | clubProjects.insertOne | projectAuditLogs.insertOne; clubProjects.updateOne(updatedAt) |
| Edit project | clubProjects.updateOne(patch, updatedAt) | same audit and timestamp writes |
| Create milestone | projectMilestones.insertOne | same audit and timestamp writes |
| Edit milestone | projectMilestones.updateOne | same audit and timestamp writes |
| Create task | projectTasks.insertOne | same audit and timestamp writes |
| Edit task | projectTasks.updateOne | same audit and timestamp writes |
| Record update or decision | projectUpdates.insertOne | same audit and timestamp writes |

If the primary write fails, the audit helper is not reached. If the audit or timestamp write fails, an HTTP 500 can be returned after the primary write has persisted. The other parallel write may also persist, creating missing audit history or a stale project timestamp. A missing parent match is currently unchecked in changeLog; project edit also does not check its matched count. Concurrent task edits only guard assignment for non-managers, not the revision of the task. Retries after an ambiguous failure can duplicate create operations.

The fault-injection tests intentionally assert existing partial writes for audit and timestamp failure, rather than introducing red CI. They will be changed to assert rollback as each endpoint migrates. The in-memory fixture models write failure deterministically; it is not a MongoDB integration test.

Target: one session/transaction for authorization reads, primary mutation, audit and timestamp; no response until commit; no nontransactional fallback. Task edits additionally require a client revision and a scoped compare-and-set.

## Transaction infrastructure

Supabase/Atlas mode requires a session-capable replica set (including a single-node development replica set) or sharded cluster. Standalone mongod is not supported. Startup verifies the hello topology before registering the MongoClient. The shared helper uses the MongoDB driver's withTransaction retry semantics and a 10-second client-side timeout, snapshot reads and majority writes. Each session is closed in finally. Callbacks may be retried; do not send responses or perform external side effects inside them. All operations must receive the session and run sequentially. An unknown commit outcome is not proof of rollback; do not automatically replay a create from the HTTP layer.

PR 07 introduces infrastructure only; endpoint migration follows.

## Project and milestone migration (PR 08)

Project create/edit and milestone create/edit now perform authorization and validation reads, primary write, audit insert and parent timestamp update in one session. The response is sent only after commit. Missing parent matches abort. The fault tests for these four routes now assert full rollback; task/update routes retain baseline expectations until PR 09. The fixture models staged writes and abort; a real replica-set integration check is still recommended.
