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

Supabase/Atlas mode requires a session-capable replica set (including a single-node development replica set) or sharded cluster. Standalone mongod is not supported. Startup verifies the hello topology before registering the MongoClient. MongoDB driver 6.22 ignores withTransaction timeoutMS. The shared helper uses the public core transaction API with snapshot reads, majority writes, at most three transaction attempts and three commit attempts per transaction, and a 10-second monotonic retry/admission window. It refuses to start a new commit after the window expires. Supabase-mode connections use a 10-second socket timeout, five-second pool wait/server selection limits, and transactions use maxCommitTimeMS and majority write concern timeout. This bounds retry admission, not an absolute wall-clock cancellation guarantee: in-flight driver operations and cleanup can exceed the window. Unknown commit results retry only commit and return TRANSACTION_OUTCOME_UNKNOWN if unresolved; the callback is never replayed after ambiguity. Each session is closed in finally. Callbacks may be retried; do not send responses or perform external side effects inside them. All operations must receive the session and run sequentially. An unknown commit outcome is not proof of rollback; do not automatically replay a create from the HTTP layer.

PR 07 introduces infrastructure only; endpoint migration follows.
