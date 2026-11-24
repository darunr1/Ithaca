// Only connections explicitly checked for transaction support may write projects.
const clients = new WeakMap();
const RETRY_WINDOW_MS = 10000;
const MAX_ATTEMPTS = 3;
const transient = error => error?.hasErrorLabel?.('TransientTransactionError') === true;
const unknownCommit = error => error?.hasErrorLabel?.('UnknownTransactionCommitResult') === true;
const deadlineError = () => Object.assign(new Error('Project transaction retry budget exhausted. Refresh and retry.'), {
  status: 503, code: 'TRANSACTION_RETRY_EXHAUSTED'
});
const uncertainError = cause => Object.assign(new Error('Project transaction commit outcome is unknown. Refresh before retrying.'), {
  status: 503, code: 'TRANSACTION_OUTCOME_UNKNOWN', cause
});

export function supportsTransactions(hello) {
  return hello.logicalSessionTimeoutMinutes != null &&
    (hello.msg === 'isdbgrid' ? hello.maxWireVersion >= 8 :
      Boolean(hello.setName) && hello.maxWireVersion >= 7);
}

export function registerTransactionClient(db, client) {
  clients.set(db, client);
}

// Driver 6.22 intentionally ignores withTransaction timeoutMS. Use the public
// core transaction API instead; never race an active DB operation against a timer.
export async function withProjectTransaction(db, work, { now = () => performance.now() } = {}) {
  const client = clients.get(db);
  if (!client) {
    throw Object.assign(new Error('Project writes require a transaction-capable MongoDB connection.'), {
      status: 503, code: 'TRANSACTIONS_UNAVAILABLE'
    });
  }
  const deadline = now() + RETRY_WINDOW_MS;
  const session = client.startSession();
  const remaining = () => deadline - now();
  const ensureBudget = () => { if (remaining() <= 0) throw deadlineError(); };
  const abort = async () => {
    if (session.inTransaction()) {
      try { await session.abortTransaction(); } catch { /* preserve primary failure; endSession still runs */ }
    }
  };
  try {
    transaction: for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      ensureBudget();
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', wtimeoutMS: Math.max(1, Math.floor(remaining())) },
        readPreference: 'primary',
        maxCommitTimeMS: Math.max(1, Math.floor(remaining()))
      });
      let result;
      try {
        result = await work(session);
        ensureBudget(); // Never start a fresh commit after the retry window.
      } catch (error) {
        await abort();
        if (!transient(error)) throw error;
        if (attempt === MAX_ATTEMPTS || remaining() <= 0) throw deadlineError();
        continue;
      }

      let ambiguous = false;
      for (let commitAttempt = 1; commitAttempt <= MAX_ATTEMPTS; commitAttempt++) {
        try {
          await session.commitTransaction();
          return result;
        } catch (error) {
          if (unknownCommit(error)) {
            ambiguous = true;
            if (commitAttempt < MAX_ATTEMPTS && remaining() > 0) continue;
            throw uncertainError(error);
          }
          // Once a commit may have succeeded, never rerun the callback.
          if (ambiguous) throw uncertainError(error);
          if (transient(error)) {
            await abort();
            if (attempt === MAX_ATTEMPTS || remaining() <= 0) throw deadlineError();
            continue transaction;
          }
          await abort();
          throw error;
        }
      }
    }
    throw deadlineError();
  } finally {
    await session.endSession();
  }
}
