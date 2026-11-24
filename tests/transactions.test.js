import test from 'node:test';
import assert from 'node:assert/strict';
import { supportsTransactions, registerTransactionClient, withProjectTransaction } from '../backend/services/transactions.js';

test('only transaction-capable session topologies are accepted', () => {
  assert.equal(supportsTransactions({ logicalSessionTimeoutMinutes: 30, maxWireVersion: 21 }), false);
  assert.equal(supportsTransactions({ setName: 'rs0', logicalSessionTimeoutMinutes: 30, maxWireVersion: 7 }), true);
  assert.equal(supportsTransactions({ msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30, maxWireVersion: 7 }), false);
  assert.equal(supportsTransactions({ msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30, maxWireVersion: 8 }), true);
  assert.equal(supportsTransactions({ setName: 'rs0', maxWireVersion: 21 }), false);
});

test('unregistered connection fails closed without running callback', async () => {
  await assert.rejects(withProjectTransaction({}, () => assert.fail('unexpected write')),
    { status: 503, code: 'TRANSACTIONS_UNAVAILABLE' });
});

const labeled = label => Object.assign(new Error(label), { hasErrorLabel: name => name === label });
function fixture(commitErrors = []) {
  const db = {}, calls = { start: 0, abort: 0, commit: 0, end: 0 };
  let active = false;
  const session = {
    startTransaction(options) {
      calls.start++;
      active = true;
      assert.ok(options.maxCommitTimeMS > 0 && options.maxCommitTimeMS <= 10000);
      assert.equal(options.writeConcern.w, 'majority');
      assert.equal(options.readConcern.level, 'snapshot');
      assert.equal(options.readPreference, 'primary');
      assert.equal('timeoutMS' in options, false);
    },
    inTransaction: () => active,
    async abortTransaction() { calls.abort++; active = false; },
    async commitTransaction() {
      calls.commit++;
      active = false;
      if (commitErrors.length) throw commitErrors.shift();
    },
    async endSession() { calls.end++; }
  };
  registerTransactionClient(db, { startSession: () => session });
  return { db, session, calls };
}

test('transient callback failures retry the transaction and close the session', async () => {
  const { db, session, calls } = fixture();
  let attempts = 0;
  assert.equal(await withProjectTransaction(db, async actual => {
    assert.equal(actual, session);
    if (++attempts === 1) throw labeled('TransientTransactionError');
    return 'committed';
  }), 'committed');
  assert.deepEqual(calls, { start: 2, abort: 1, commit: 1, end: 1 });
});

test('persistent transient errors have a finite attempt limit', async () => {
  const { db, calls } = fixture();
  await assert.rejects(withProjectTransaction(db, async () => { throw labeled('TransientTransactionError'); }),
    { status: 503, code: 'TRANSACTION_RETRY_EXHAUSTED' });
  assert.deepEqual(calls, { start: 3, abort: 3, commit: 0, end: 1 });
});

test('deadline stops retries and aborts successful callbacks before starting a late commit', async () => {
  for (const fail of [false, true]) {
    const { db, calls } = fixture();
    let clock = 0;
    await assert.rejects(withProjectTransaction(db, async () => {
      clock = 10001;
      if (fail) throw labeled('TransientTransactionError');
    }, { now: () => clock }), { status: 503, code: 'TRANSACTION_RETRY_EXHAUSTED' });
    assert.deepEqual(calls, { start: 1, abort: 1, commit: 0, end: 1 });
  }
});

test('ambiguous commit retries commit only; never replay callback', async () => {
  const { db, calls } = fixture([labeled('UnknownTransactionCommitResult')]);
  let work = 0;
  assert.equal(await withProjectTransaction(db, async () => ++work), 1);
  assert.deepEqual(calls, { start: 1, abort: 0, commit: 2, end: 1 });
});

test('persistent or subsequent ambiguous errors fail with unknown outcome, not replay', async () => {
  for (const errors of [
    Array.from({ length: 3 }, () => labeled('UnknownTransactionCommitResult')),
    [labeled('UnknownTransactionCommitResult'), labeled('TransientTransactionError')]
  ]) {
    const { db, calls } = fixture(errors);
    await assert.rejects(withProjectTransaction(db, async () => 'result'), { code: 'TRANSACTION_OUTCOME_UNKNOWN' });
    assert.equal(calls.start, 1);
    assert.equal(calls.abort, 0);
    assert.equal(calls.end, 1);
  }
});

test('transient commit failure before ambiguity retries body, ordinary failures abort/close', async () => {
  const first = fixture([labeled('TransientTransactionError')]);
  assert.equal(await withProjectTransaction(first.db, async () => 42), 42);
  assert.equal(first.calls.start, 2);
  assert.equal(first.calls.end, 1);
  const second = fixture();
  const error = new Error('rejected');
  await assert.rejects(withProjectTransaction(second.db, async () => { throw error; }), actual => actual === error);
  assert.deepEqual(second.calls, { start: 1, abort: 1, commit: 0, end: 1 });
});
