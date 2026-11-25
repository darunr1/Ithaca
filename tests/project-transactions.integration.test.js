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

async function projectServer(t) {
  assert.equal(uri, 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true');
  const { default: express } = await import('express');
  const { projectRoutes } = await import('../backend/routes/projects.js');
  const { definitions } = await import('../database/definitions.js');
  const connection = await connectDatabase({ DATA_MODE: 'atlas', AUTH_MODE: 'supabase',
    MONGODB_URI: uri, MONGODB_DB: 'ithaca_tx_test_' + randomUUID().replaceAll('-', '') });
  const { db } = connection;
  t.after(async () => { try { await db.dropDatabase(); } finally { await connection.close(); } });
  for (const name of ['clubProjects', 'projectMilestones', 'projectTasks', 'projectUpdates', 'projectAuditLogs']) {
    await db.createCollection(name, { validator: definitions[name] });
    await db.collection(name).createIndex({ id: 1 }, { unique: true });
  }
  await db.collection('members').insertOne({ id: 'alice', clubIds: ['club'] });
  await db.collection('clubs').insertOne({ id: 'club', ownerId: 'alice', officerIds: ['alice'] });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.memberId = 'alice'; next(); });
  app.use(projectRoutes({ db, send: (res, data) => res.json({ data }) }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: { code: error.code } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/club/projects';
  const call = async (method, suffix, body) => {
    const res = await fetch(base + suffix, { method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const created = await call('POST', '', { name: 'Initial project' });
  assert.equal(created.status, 201);
  const path = '/' + created.data.data.project.id;
  const milestone = await call('POST', path + '/milestones', { title: 'Initial milestone' });
  assert.equal(milestone.status, 201);
  const task = await call('POST', path + '/tasks', { title: 'Initial task' });
  assert.equal(task.status, 201);
  const milestonePath = path + '/milestones/' + milestone.data.data.milestone.id;
  const taskPath = path + '/tasks/' + task.data.data.task.id;
  const snapshot = async () => Promise.all(['clubProjects', 'projectMilestones', 'projectTasks', 'projectUpdates', 'projectAuditLogs']
    .map(name => db.collection(name).find().sort({ id: 1 }).toArray()));
  const rejectAudits = async () => db.command({ collMod: 'projectAuditLogs',
    validator: { $and: [definitions.projectAuditLogs, { action: 'never-allowed' }] }, validationLevel: 'strict' });
  return { db, call, path, milestonePath, taskPath, snapshot, rejectAudits };
}

test('replica set: project and milestone HTTP mutations roll back on audit validation failure', { skip: !uri, timeout: 60000 }, async t => {
  const { call, path, milestonePath, snapshot, rejectAudits } = await projectServer(t);
  await rejectAudits();
  const before = await snapshot();
  for (const [method, suffix, body] of [
    ['POST', '', { name: 'Rejected project' }],
    ['PATCH', path, { status: 'on_hold' }],
    ['POST', path + '/milestones', { title: 'Rejected milestone' }],
    ['PATCH', milestonePath, { status: 'done' }]
  ]) {
    assert.equal((await call(method, suffix, body)).status, 500);
    assert.deepEqual(await snapshot(), before);
  }
});

test('replica set: task and decision HTTP mutations roll back on audit validation failure', { skip: !uri, timeout: 60000 }, async t => {
  const { call, path, taskPath, snapshot, rejectAudits } = await projectServer(t);
  await rejectAudits();
  const before = await snapshot();
  for (const [method, suffix, body] of [
    ['POST', path + '/tasks', { title: 'Rejected task' }],
    ['PATCH', taskPath, { status: 'done', expectedVersion: 0 }],
    ['POST', path + '/updates', { type: 'decision', content: 'Rejected decision content.' }]
  ]) {
    assert.equal((await call(method, suffix, body)).status, 500);
    assert.deepEqual(await snapshot(), before);
  }
});

test('replica set: simultaneous edits at one version commit exactly once', { skip: !uri, timeout: 60000 }, async t => {
  const { db, call, path, taskPath } = await projectServer(t);
  const before = await db.collection('projectAuditLogs').countDocuments();
  const responses = await Promise.all(['done', 'blocked'].map(status =>
    call('PATCH', taskPath, { status, expectedVersion: 0 })));
  assert.deepEqual(responses.map(res => res.status).sort(), [200, 409]);
  assert.equal(responses.find(res => res.status === 409).data.error.code, 'TASK_CHANGED');
  const winner = responses.find(res => res.status === 200).data.data;
  const detail = await call('GET', path);
  assert.equal(detail.data.data.tasks[0].status, winner.status);
  assert.equal(detail.data.data.tasks[0].version, 1);
  assert.equal(await db.collection('projectAuditLogs').countDocuments(), before + 1);
});
