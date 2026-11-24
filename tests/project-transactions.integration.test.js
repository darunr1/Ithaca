import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../database/connection.js';
import { withProjectTransaction } from '../backend/services/transactions.js';

const uri = process.env.PROJECT_TRANSACTION_TEST_URI;
test('replica set: real transaction abort and successful commit', { skip: !uri, timeout: 60000 }, async t => {
  assert.equal(uri, 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true', 'Use only the isolated local CI replica set.');
  const connection = await connectDatabase({ DATA_MODE: 'atlas', AUTH_MODE: 'supabase',
    MONGODB_URI: uri, MONGODB_DB: 'ithaca_tx_test_' + randomUUID().replaceAll('-', '') });
  const { db } = connection;
  t.after(async () => { try { await db.dropDatabase(); } finally { await connection.close(); } });
  const primary = await db.createCollection('primary');
  const audit = await db.createCollection('audit', { validator: { allowed: true } });
  await assert.rejects(withProjectTransaction(db, async session => {
    await primary.insertOne({ id: 'aborted' }, { session });
    await audit.insertOne({ allowed: false }, { session });
  }), { code: 121 });
  assert.equal(await primary.countDocuments(), 0);
  assert.equal(await audit.countDocuments(), 0);
  await withProjectTransaction(db, async session => {
    await primary.insertOne({ id: 'committed' }, { session });
    await audit.insertOne({ allowed: true }, { session });
  });
  assert.equal(await primary.countDocuments(), 1);
  assert.equal(await audit.countDocuments(), 1);
});
