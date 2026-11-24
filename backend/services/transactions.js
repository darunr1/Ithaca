// Only connections explicitly checked for transaction support may write projects.
const clients = new WeakMap();

export function supportsTransactions(hello) {
  return hello.logicalSessionTimeoutMinutes != null &&
    (hello.msg === 'isdbgrid' ? hello.maxWireVersion >= 8 :
      Boolean(hello.setName) && hello.maxWireVersion >= 7);
}

export function registerTransactionClient(db, client) {
  clients.set(db, client);
}

export async function withProjectTransaction(db, work) {
  const client = clients.get(db);
  if (!client) {
    throw Object.assign(new Error('Project writes require a transaction-capable MongoDB connection.'), {
      status: 503, code: 'TRANSACTIONS_UNAVAILABLE'
    });
  }
  const session = client.startSession();
  try {
    // Driver 6.22 implements bounded retry of TransientTransactionError and
    // UnknownTransactionCommitResult under the same CSOT deadline. Do not
    // add an outer retry or fall back to writes outside the session.
    return await session.withTransaction(() => work(session), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
      timeoutMS: 10000
    });
  } finally {
    await session.endSession();
  }
}
