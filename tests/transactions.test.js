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

test('transaction delegates retries to driver, bounds duration and closes session', async () => {
  const db = {};
  let calls = 0, closed = 0;
  const transient = Object.assign(new Error('retry'), { hasErrorLabel: label => label === 'TransientTransactionError' });
  const session = {
    async withTransaction(work, options) {
      assert.equal(options.timeoutMS, 10000);
      assert.equal(options.writeConcern.w, 'majority');
      assert.equal(options.readConcern.level, 'snapshot');
      assert.equal(options.readPreference, 'primary');
      try { return await work(); }
      catch (error) { if (!error.hasErrorLabel?.('TransientTransactionError')) throw error; return work(); }
    },
    async endSession() { closed++; }
  };
  registerTransactionClient(db, { startSession: () => session });
  assert.equal(await withProjectTransaction(db, async actual => {
    assert.equal(actual, session);
    if (++calls === 1) throw transient;
    return 'committed';
  }), 'committed');
  assert.equal(calls, 2);
  assert.equal(closed, 1);
  const rejection = new Error('nontransient');
  await assert.rejects(withProjectTransaction(db, async () => { throw rejection; }), error => error === rejection);
  assert.equal(closed, 2);
});

test('session is cleaned up when driver reports commit failure', async () => {
  const db = {};
  let closed = false;
  registerTransactionClient(db, { startSession: () => ({
    async withTransaction(work) { await work(); throw new Error('commit failed'); },
    async endSession() { closed = true; }
  }) });
  await assert.rejects(withProjectTransaction(db, async () => 'not committed'), /commit failed/);
  assert.equal(closed, true);
});
