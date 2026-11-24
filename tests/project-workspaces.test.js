import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../backend/app.js';
import { readConfig } from '../backend/config.js';
import { definitions, indexes } from '../database/definitions.js';

function database() {
  const rows = new Map();
  let fault;
  function failWrite(name, operation, value) {
    if (fault?.name === name && fault.operation === operation && (!fault.when || fault.when(value))) {
      fault = undefined;
      throw new Error('Injected write failure');
    }
  }
  const list = name => {
    if (!rows.has(name)) rows.set(name, []);
    return rows.get(name);
  };
  const matches = (row, where) => Object.entries(where || {}).every(([key, expected]) => {
    const value = row[key];
    return Array.isArray(value) ? value.includes(expected) : value === expected;
  });
  const collection = name => ({
    async findOne(where) { return list(name).find(row => matches(row, where)) ?? null; },
    find(where) {
      let found = list(name).filter(row => matches(row, where));
      return {
        sort(spec) {
          const [field, direction] = Object.entries(spec)[0];
          found = [...found].sort((a, b) => String(a[field]).localeCompare(String(b[field])) * direction);
          return this;
        },
        limit(value) { found = found.slice(0, value); return this; },
        async toArray() { return structuredClone(found); }
      };
    },
    async insertOne(row) { failWrite(name, 'insertOne', row); list(name).push(structuredClone(row)); return { insertedId: row.id }; },
    async updateOne(where, change, opts = {}) {
      failWrite(name, 'updateOne', change);
      let row = list(name).find(row => matches(row, where));
      if (!row && opts.upsert) {
        row = structuredClone(change.$setOnInsert || where);
        list(name).push(row);
      }
      if (!row) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(row, change.$set || {});
      for (const [field, value] of Object.entries(change.$addToSet || {})) {
        row[field] ??= [];
        if (!row[field].includes(value)) row[field].push(value);
      }
      return { matchedCount: 1, modifiedCount: 1 };
    }
  });
  for (const name of ['alice', 'bob', 'outsider']) {
    const universityId = name === 'outsider' ? 'uni-b' : 'uni-a';
    const member = { id: name, name, email: name + '@example.test', clubIds: [],
      universityId, universityName: universityId === 'uni-a' ? 'A University' : 'B University',
      major: 'Computer Engineering', classification: 'junior', graduationYear: 2028,
      visibleToCompanies: false, openToNewClubs: false, year: 3, skills: [] };
    list('members').push(member);
    list('userProfiles').push({ ...member, id: 'profile-' + name, internalMemberId: name,
      authProvider: 'supabase', authProviderUserId: name, role: 'member', onboarded: true });
  }
  return { rows, collection, failNextWrite(name, operation, when) { fault = { name, operation, when }; }, async command() { return { ok: 1 }; } };
}

async function server(t) {
  const db = database();
  const config = readConfig({
    AUTH_MODE: 'supabase', DATA_MODE: 'atlas', MONGODB_URI: 'mongodb://example',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    AUTH_ISSUER: 'https://example.supabase.co/auth/v1',
    AUTH_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    AUTH_AUDIENCE: 'authenticated', AI_MODE: 'mock'
  });
  const verify = async req => {
    const token = (req.get('Authorization') || '').replace('Bearer ', '');
    if (!['alice', 'bob', 'outsider'].includes(token)) {
      throw Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHENTICATED' });
    }
    return { sub: token, email: token + '@example.test', name: token };
  };
  const app = createApp({ config, db, authentication: { verify } });
  const instance = app.listen(0, '127.0.0.1');
  await new Promise(resolve => instance.once('listening', resolve));
  t.after(() => new Promise(resolve => instance.close(resolve)));
  const base = 'http://127.0.0.1:' + instance.address().port + '/api';
  const call = async (member, path, { method = 'GET', body } = {}) => {
    const response = await fetch(base + path, {
      method, headers: { Authorization: 'Bearer ' + member, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    return { status: response.status, data: await response.json() };
  };
  return { db, call };
}

test('project features require verified identity, enforce club isolation and persist history', async t => {
  const { db, call } = await server(t);
  const badAuth = await call('bad-token', '/organizations/random/projects');
  assert.equal(badAuth.status, 401);
  const newClub = await call('alice', '/organizations', { method: 'POST',
    body: { name: 'Robotics Society', description: 'Autonomous vehicle projects' } });
  assert.equal(newClub.status, 201);
  const clubId = newClub.data.data.club.id;
  const base = '/organizations/' + clubId + '/projects';

  assert.equal((await call('bob', base)).status, 404);
  assert.equal((await call('outsider', base, { method: 'POST', body: { name: 'Hijacked club' } })).status, 404);
  assert.equal((await call('alice', base, { method: 'POST', body: { name: 'X' } })).status, 400);

  const created = await call('alice', base, { method: 'POST',
    body: { name: 'Flight Computer Upgrade', description: 'Sensor and avionics integration', targetDate: '2027-04-01' } });
  assert.equal(created.status, 201);
  const project = created.data.data.project;
  assert.ok(project.id.startsWith('project-'));
  assert.equal(project.status, 'active');
  assert.equal((await call('alice', base)).data.data.projects.length, 1);
  assert.equal((await call('bob', base + '/' + project.id)).status, 404);
  assert.equal((await call('outsider', base + '/' + project.id + '/handoff')).status, 404);
  assert.equal((await call('outsider', base + '/' + project.id + '/tasks',
    { method: 'POST', body: { title: 'Take over' } })).status, 404);

  const invitation = await call('alice', '/organizations/' + clubId + '/invitations',
    { method: 'POST', body: { memberId: 'bob' } });
  assert.equal(invitation.status, 201);
  const accepted = await call('bob', '/organizations/invitations/' + invitation.data.data.invitation.id + '/respond',
    { method: 'POST', body: { action: 'accept' } });
  assert.equal(accepted.status, 200);
  assert.equal((await call('bob', base)).status, 200);
  assert.equal((await call('bob', base, { method: 'POST', body: { name: 'Unauthorized project' } })).status, 403);
  assert.equal((await call('bob', base + '/' + project.id, { method: 'PATCH', body: { status: 'archived' } })).status, 403);

  const milestone = await call('alice', base + '/' + project.id + '/milestones',
    { method: 'POST', body: { title: 'Bench validation', dueDate: '2027-02-01' } });
  assert.equal(milestone.status, 201);
  const milestoneId = milestone.data.data.milestone.id;
  assert.equal((await call('bob', base + '/' + project.id + '/milestones',
    { method: 'POST', body: { title: 'Unapproved milestone' } })).status, 403);

  const task = await call('alice', base + '/' + project.id + '/tasks', { method: 'POST', body: {
    title: 'Test telemetry parser', assigneeId: 'bob', milestoneId, dueDate: '2027-01-05'
  } });
  assert.equal(task.status, 201);
  const taskId = task.data.data.task.id;
  assert.equal((await call('alice', base + '/' + project.id + '/tasks', { method: 'POST',
    body: { title: 'Cross school assignment', assigneeId: 'outsider' } })).status, 422);
  assert.equal((await call('bob', base + '/' + project.id + '/tasks', { method: 'POST',
    body: { title: 'Assign to an officer', assigneeId: 'alice' } })).status, 403);
  assert.equal((await call('bob', base + '/' + project.id + '/tasks/' + taskId,
    { method: 'PATCH', body: { title: 'Unauthorized change' } })).status, 403);

  const done = await call('bob', base + '/' + project.id + '/tasks/' + taskId,
    { method: 'PATCH', body: { status: 'done', evidenceUrl: 'https://example.com/evidence' } });
  assert.equal(done.status, 200);
  const memberTask = await call('bob', base + '/' + project.id + '/tasks',
    { method: 'POST', body: { title: 'Document parser integration' } });
  assert.equal(memberTask.status, 201);
  assert.equal(memberTask.data.data.task.assigneeId, 'bob');
  assert.equal((await call('alice', base + '/' + project.id + '/milestones/' + milestoneId, {
    method: 'PATCH', body: { status: 'done' }
  })).status, 200);
  assert.equal((await call('bob', base + '/' + project.id + '/updates',
    { method: 'POST', body: { type: 'decision', content: 'Use a shared CAN message schema.' } })).status, 403);
  const update = await call('alice', base + '/' + project.id + '/updates',
    { method: 'POST', body: { type: 'decision', content: 'Use a shared CAN message schema.' } });
  assert.equal(update.status, 201);
  assert.equal((await call('bob', base + '/' + project.id + '/updates',
    { method: 'POST', body: { type: 'decision', content: 'abc' } })).status, 400);

  const detail = await call('alice', base + '/' + project.id);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.data.summary.totalTasks, 2);
  assert.equal(detail.data.data.summary.completedTasks, 1);
  assert.equal(detail.data.data.summary.completionPercent, 50);
  assert.equal(detail.data.data.milestones[0].status, 'done');
  assert.equal(detail.data.data.updates[0].type, 'decision');
  assert.ok(!('_id' in detail.data.data.tasks[0]));
  const handoff = await call('alice', base + '/' + project.id + '/handoff');
  assert.equal(handoff.status, 200);
  assert.match(handoff.data.data.markdown, /Test telemetry parser/);
  assert.match(handoff.data.data.markdown, /Use a shared CAN message schema/);
  assert.match(handoff.data.data.markdown, /Bench validation/);
  assert.ok(db.rows.get('projectAuditLogs').length >= 6);
  assert.ok(!handoff.data.data.markdown.includes('example.test'));
});

test('project leads can manage tasks, but cannot elevate members to new leads', async t => {
  const { call } = await server(t);
  const club = await call('alice', '/organizations', { method: 'POST', body: { name: 'Firmware Society' } });
  const clubId = club.data.data.club.id;
  const invite = await call('alice', '/organizations/' + clubId + '/invitations',
    { method: 'POST', body: { memberId: 'bob' } });
  await call('bob', '/organizations/invitations/' + invite.data.data.invitation.id + '/respond',
    { method: 'POST', body: { action: 'accept' } });
  const base = '/organizations/' + clubId + '/projects';
  const project = await call('alice', base, { method: 'POST',
    body: { name: 'Prototype', leadIds: ['bob'] } });
  assert.equal(project.status, 201);
  const id = project.data.data.project.id;
  assert.equal((await call('bob', base + '/' + id + '/milestones', {
    method: 'POST', body: { title: 'Design freeze' }
  })).status, 201);
  assert.equal((await call('bob', base + '/' + id, {
    method: 'PATCH', body: { leadIds: ['alice', 'bob'] }
  })).status, 403);
  assert.equal((await call('bob', base + '/' + id, {
    method: 'PATCH', body: { status: 'on_hold' }
  })).status, 200);
  assert.equal((await call('bob', base + '/' + id + '/tasks', {
    method: 'POST', body: { title: 'Review firmware release', assigneeId: 'alice' }
  })).status, 201);
});

test('project collection schemas/indexes exist and demo mode cannot persist real projects', async () => {
  for (const name of ['clubProjects', 'projectMilestones', 'projectTasks', 'projectUpdates', 'projectAuditLogs']) {
    assert.ok(definitions[name], name + ' missing database validation');
    assert.ok(indexes[name]?.some(index => index.key.clubId === 1), name + ' lacks tenant-scoped index');
  }
  const app = createApp({ config: readConfig({ DATA_MODE: 'demo', AUTH_MODE: 'demo', AI_MODE: 'mock' }) });
  const instance = app.listen(0, '127.0.0.1');
  await new Promise(resolve => instance.once('listening', resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + instance.address().port + '/api/organizations/club-rocketry/projects');
    assert.equal(response.status, 404);
  } finally { await new Promise(resolve => instance.close(resolve)); }
});

const mutationCases = [
  ['project create', 'clubProjects', 'POST', '', { name: 'Second project' }, false],
  ['project edit', 'clubProjects', 'PATCH', '/project', { status: 'on_hold' }, false],
  ['milestone create', 'projectMilestones', 'POST', '/project/milestones', { title: 'Second milestone' }, false],
  ['milestone edit', 'projectMilestones', 'PATCH', '/project/milestones/milestone', { status: 'done' }, false],
  ['task create', 'projectTasks', 'POST', '/project/tasks', { title: 'Second task' }, false],
  ['task edit', 'projectTasks', 'PATCH', '/project/tasks/task', { status: 'done' }, false],
  ['decision create', 'projectUpdates', 'POST', '/project/updates', { type: 'decision', content: 'Record a new decision.' }, false]
];

async function mutationFixture(t) {
  const { db, call } = await server(t);
  const club = await call('alice', '/organizations', { method: 'POST', body: { name: 'Integrity Society' } });
  assert.equal(club.status, 201);
  const base = '/organizations/' + club.data.data.club.id + '/projects';
  const project = await call('alice', base, { method: 'POST', body: { name: 'Prototype' } });
  assert.equal(project.status, 201);
  const projectPath = base + '/' + project.data.data.project.id;
  const milestone = await call('alice', projectPath + '/milestones', { method: 'POST', body: { title: 'Baseline milestone' } });
  const task = await call('alice', projectPath + '/tasks', { method: 'POST', body: { title: 'Baseline task' } });
  assert.equal(milestone.status, 201);
  assert.equal(task.status, 201);
  const resolve = suffix => base + suffix.replace('/project', '/' + project.data.data.project.id)
    .replace('/milestones/milestone', '/milestones/' + milestone.data.data.milestone.id)
    .replace('/tasks/task', '/tasks/' + task.data.data.task.id);
  const snapshot = name => structuredClone(db.rows.get(name) || []);
  return { db, call, resolve, snapshot, projectPath, taskId: task.data.data.task.id };
}

for (const [name, collection, method, suffix, body, atomic] of mutationCases) {
  for (const failure of ['audit', 'timestamp']) {
    test(name + ': ' + failure + ' failure ' + (atomic ? 'rolls back' : 'exposes a partial write'), async t => {
      const { db, call, resolve, snapshot } = await mutationFixture(t);
      // Avoid timestamp equality when requests happen within the same millisecond.
      for (const project of db.rows.get('clubProjects')) project.updatedAt = '2000-01-01T00:00:00.000Z';
      const before = snapshot(collection);
      const projects = snapshot('clubProjects');
      const audit = snapshot('projectAuditLogs');
      if (failure === 'audit') db.failNextWrite('projectAuditLogs', 'insertOne');
      else db.failNextWrite('clubProjects', 'updateOne', change =>
        Object.keys(change.$set || {}).join(',') === 'updatedAt');
      const response = await call('alice', resolve(suffix), { method, body });
      assert.equal(response.status, 500);
      if (atomic) {
        assert.deepEqual(snapshot(collection), before);
        assert.deepEqual(snapshot('clubProjects'), projects);
        assert.deepEqual(snapshot('projectAuditLogs'), audit);
      } else {
        assert.notDeepEqual(snapshot(collection), before, 'primary mutation survived a failed response');
        if (failure === 'audit') {
          assert.deepEqual(snapshot('projectAuditLogs'), audit);
          assert.notDeepEqual(snapshot('clubProjects'), projects);
        } else {
          assert.equal(snapshot('projectAuditLogs').length, audit.length + 1);
        }
      }
    });
  }
}
