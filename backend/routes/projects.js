import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { httpError } from '../services/workspace.js';
import { withProjectTransaction } from '../services/transactions.js';
import { requireClubMember } from '../services/authorization.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date.');
const text = (min, max) => z.string().trim().min(min).max(max);
const projectStatus = z.enum(['active', 'on_hold', 'completed', 'archived']);
const taskStatus = z.enum(['todo', 'in_progress', 'blocked', 'done']);
const offset = z.string().regex(/^\d{1,9}$/).transform(Number).pipe(z.number().int().min(0).max(1000000));
const limit = max => z.string().regex(/^\d{1,4}$/).transform(Number).pipe(z.number().int().min(1).max(max));
const listPaging = z.object({ offset: offset.optional(), limit: limit(200).optional() }).strict();
const taskFilters = z.object({
  mine: z.enum(['true', 'false']).optional(), status: taskStatus.optional(),
  assignee: z.union([id, z.literal('unassigned')]).optional(),
  q: z.string().trim().max(120).optional(), sort: z.enum(['newest', 'oldest', 'title']).default('newest'),
  taskOffset: offset.optional(), taskLimit: limit(500).optional(),
  updateOffset: offset.optional(), updateLimit: limit(100).optional(),
  milestoneOffset: offset.optional(), milestoneLimit: limit(200).optional()
}).strict();
const taskSorts = { newest: { createdAt: -1, id: 1 }, oldest: { createdAt: 1, id: 1 }, title: { title: 1, id: 1 } };
const milestoneStatus = z.enum(['planned', 'in_progress', 'done']);
const evidenceUrl = z.string().url().max(1000).refine(value => /^https?:\/\//i.test(value), 'Use an http(s) URL.').nullable();
const createProject = z.object({
  name: text(3, 120), description: text(0, 3000).default(''),
  status: projectStatus.default('active'), targetDate: date.nullable().default(null),
  leadIds: z.array(id).max(15).default([])
}).strict();
const editProject = z.object({
  name: text(3, 120).optional(), description: text(0, 3000).optional(),
  status: projectStatus.optional(), targetDate: date.nullable().optional(),
  leadIds: z.array(id).max(15).optional()
}).strict();
const createMilestone = z.object({
  title: text(3, 150), description: text(0, 1000).default(''),
  dueDate: date.nullable().default(null), status: milestoneStatus.default('planned')
}).strict();
const editMilestone = z.object({
  title: text(3, 150).optional(), description: text(0, 1000).optional(),
  dueDate: date.nullable().optional(), status: milestoneStatus.optional()
}).strict();
const createTask = z.object({
  title: text(3, 150), description: text(0, 3000).default(''),
  status: taskStatus.default('todo'), assigneeId: id.nullable().default(null),
  milestoneId: id.nullable().default(null), dueDate: date.nullable().default(null),
  evidenceUrl: evidenceUrl.default(null)
}).strict();
const editTask = z.object({
  expectedVersion: z.number().int().min(0).max(2147483646),
  title: text(3, 150).optional(), description: text(0, 3000).optional(),
  status: taskStatus.optional(), assigneeId: id.nullable().optional(),
  milestoneId: id.nullable().optional(), dueDate: date.nullable().optional(),
  evidenceUrl: evidenceUrl.optional()
}).strict();
const createUpdate = z.object({
  type: z.enum(['progress', 'decision', 'blocker', 'meeting']),
  content: text(5, 3000)
}).strict();

async function page(collection, scope, sort, start, size) {
  const rows = await collection.find(scope).sort(sort).skip(start).limit(size + 1).toArray();
  const hasMore = rows.length > size;
  return { rows: rows.slice(0, size), pagination: {
    offset: start, limit: size, hasMore,
    nextOffset: hasMore ? start + size : null, previousOffset: start ? Math.max(0, start - size) : null
  } };
}
const clean = ({ _id, ...rest }) => rest;
const newest = rows => rows.map(clean);
const cleanTask = task => clean({ ...task, version: task.version ?? 0 });
const requirePatch = body => {
  if (!Object.keys(body).length) throw httpError(400, 'EMPTY_PATCH', 'Provide at least one field to update.');
  return body;
};
const assertManager = (access, project) => {
  if (!access.isOfficer && !(project.leadIds || []).includes(access.actor.id)) {
    throw httpError(403, 'PROJECT_LEAD_REQUIRED', 'Only club officers or this project’s leads can manage it.');
  }
};
const assertOfficer = access => {
  if (!access.isOfficer) throw httpError(403, 'OFFICER_REQUIRED', 'Only club officers can perform this action.');
};

// Auth is provided by the verified Supabase identity middleware and this router is
// mounted ONLY in AUTH_MODE=supabase. Never trust a client-supplied member ID.
export function projectRoutes({ db, send }) {
  const router = Router();
  async function accessFor(req, session) {
    const clubId = id.parse(req.params.clubId);
    const { actor, club } = await requireClubMember(req, db, clubId, session);
    return { clubId, actor, club, isOfficer: Boolean(club.officerIds?.includes(actor.id)) };
  }
  async function projectFor(access, projectId, session) {
    const project = await db.collection('clubProjects').findOne({ id: id.parse(projectId), clubId: access.clubId }, { session });
    if (!project) throw httpError(404, 'NOT_FOUND', 'Project not found or inaccessible.');
    return project;
  }
  async function memberInClub(memberId, access, session) {
    if (!memberId) return;
    if (!(await db.collection('members').findOne({
      id: memberId, clubIds: access.clubId, universityId: access.club.universityId
    }, { session }))) {
      throw httpError(422, 'INVALID_ASSIGNEE', 'The selected member does not belong to this club.');
    }
  }
  async function milestoneInProject(milestoneId, access, project, session) {
    if (!milestoneId) return;
    if (!(await db.collection('projectMilestones').findOne({
      id: milestoneId, clubId: access.clubId, projectId: project.id
    }, { session }))) throw httpError(422, 'INVALID_MILESTONE', 'Milestone does not belong to this project.');
  }
  async function changeLog(access, project, action, entityId, session) {
    const now = new Date().toISOString();
    const entry = {
      id: 'project-audit-' + randomUUID(), clubId: access.clubId,
      projectId: project.id, actorId: access.actor.id, action, entityId, createdAt: now
    };
    const audit = () => db.collection('projectAuditLogs').insertOne(entry, { session });
    const touch = () => db.collection('clubProjects').updateOne(
      { id: project.id, clubId: access.clubId }, { $set: { updatedAt: now } }, { session });
    await audit();
    const result = await touch();
    if (!result.matchedCount) throw httpError(409, 'PROJECT_CHANGED', 'The project changed. Refresh and retry.');
    return now;
  }

  // The callback returns data only; HTTP responses are emitted after commit.
  const mutate = (work, status = 200) => async (req, res) => {
    const payload = await withProjectTransaction(db, session => work(req, session));
    res.status(status);
    send(res, payload);
  };

  router.get('/:clubId/projects', async (req, res) => {
    const access = await accessFor(req);
    const query = listPaging.parse(req.query);
    const result = await page(db.collection('clubProjects'), { clubId: access.clubId },
      { createdAt: -1, id: 1 }, query.offset ?? 0, query.limit ?? 200);
    send(res, { projects: newest(result.rows), pagination: result.pagination });
  });

  router.post('/:clubId/projects', mutate(async (req, session) => {
    const access = await accessFor(req, session);
    assertOfficer(access);
    const input = createProject.parse(req.body ?? {});
    for (const leadId of new Set(input.leadIds)) await memberInClub(leadId, access, session);
    const now = new Date().toISOString();
    const project = {
      id: 'project-' + randomUUID(), clubId: access.clubId,
      ...input, leadIds: [...new Set(input.leadIds)],
      createdBy: access.actor.id, createdAt: now, updatedAt: now
    };
    await db.collection('clubProjects').insertOne(project, { session });
    const updatedAt = await changeLog(access, project, 'project.created', project.id, session);
    return { project: clean({ ...project, updatedAt }) };
  }, 201));

  router.get('/:clubId/projects/:projectId', async (req, res) => {
    const access = await accessFor(req);
    const project = await projectFor(access, req.params.projectId);
    const scope = { clubId: access.clubId, projectId: project.id };
    const filters = taskFilters.parse(req.query);
    const taskScope = { ...scope };
    if (filters.status) taskScope.status = filters.status;
    if (filters.assignee && filters.assignee !== 'unassigned') await memberInClub(filters.assignee, access);
    if (filters.mine === 'true') {
      if (filters.assignee) throw httpError(400, 'INVALID_FILTER', 'Choose My Tasks or an assignee, not both.');
      taskScope.assigneeId = access.actor.id;
    } else if (filters.assignee) taskScope.assigneeId = filters.assignee === 'unassigned' ? null : filters.assignee;
    if (filters.q) {
      const literal = Array.from(filters.q, char => '.*+?^${}()|[]'.includes(char) || char.charCodeAt(0) === 92 ? String.fromCharCode(92) + char : char).join('');
      const regex = new RegExp(literal, 'i');
      taskScope.$or = [{ title: regex }, { description: regex }];
    }
    const taskCollection = db.collection('projectTasks');
    const [milestonePage, taskPage, updatePage, total, completed, blocked] = await Promise.all([
      page(db.collection('projectMilestones'), scope, { createdAt: 1, id: 1 }, filters.milestoneOffset ?? 0, filters.milestoneLimit ?? 200),
      page(taskCollection, taskScope, taskSorts[filters.sort], filters.taskOffset ?? 0, filters.taskLimit ?? 500),
      page(db.collection('projectUpdates'), scope, { createdAt: -1, id: 1 }, filters.updateOffset ?? 0, filters.updateLimit ?? 100),
      taskCollection.countDocuments(scope), taskCollection.countDocuments({ ...scope, status: 'done' }),
      taskCollection.countDocuments({ ...scope, status: 'blocked' })
    ]);
    send(res, {
      project: clean(project), milestones: newest(milestonePage.rows), tasks: taskPage.rows.map(cleanTask), updates: newest(updatePage.rows),
      pagination: { milestones: milestonePage.pagination, tasks: taskPage.pagination, updates: updatePage.pagination },
      summary: { totalTasks: total, completedTasks: completed, blockedTasks: blocked,
        completionPercent: total ? Math.round(100 * completed / total) : 0 },
      permissions: { canManage: access.isOfficer || (project.leadIds || []).includes(access.actor.id), actorId: access.actor.id }
    });
  });

  router.patch('/:clubId/projects/:projectId', mutate(async (req, session) => {
    const access = await accessFor(req, session);
    const project = await projectFor(access, req.params.projectId, session);
    assertManager(access, project);
    const patch = requirePatch(editProject.parse(req.body ?? {}));
    if ('leadIds' in patch) {
      assertOfficer(access);
      for (const leadId of new Set(patch.leadIds)) await memberInClub(leadId, access, session);
      patch.leadIds = [...new Set(patch.leadIds)];
    }
    const result = await db.collection('clubProjects').updateOne({ id: project.id, clubId: access.clubId }, { $set: { ...patch, updatedAt: new Date().toISOString() } }, { session });
    if (!result.matchedCount) throw httpError(409, 'PROJECT_CHANGED', 'The project changed. Refresh and retry.');
    const updatedAt = await changeLog(access, project, 'project.updated', project.id, session);
    return { project: clean({ ...project, ...patch, updatedAt }) };
  }));

  router.post('/:clubId/projects/:projectId/milestones', mutate(async (req, session) => {
    const access = await accessFor(req, session);
    const project = await projectFor(access, req.params.projectId, session);
    assertManager(access, project);
    const input = createMilestone.parse(req.body ?? {});
    const milestone = { id: 'milestone-' + randomUUID(), clubId: access.clubId, projectId: project.id,
      ...input, createdBy: access.actor.id, createdAt: new Date().toISOString() };
    await db.collection('projectMilestones').insertOne(milestone, { session });
    await changeLog(access, project, 'milestone.created', milestone.id, session);
    return { milestone: clean(milestone) };
  }, 201));

  router.patch('/:clubId/projects/:projectId/milestones/:milestoneId', mutate(async (req, session) => {
    const access = await accessFor(req, session);
    const project = await projectFor(access, req.params.projectId, session);
    assertManager(access, project);
    const milestoneId = id.parse(req.params.milestoneId);
    const patch = requirePatch(editMilestone.parse(req.body ?? {}));
    const result = await db.collection('projectMilestones').updateOne({
      id: milestoneId, clubId: access.clubId, projectId: project.id
    }, { $set: patch }, { session });
    if (!result.matchedCount) throw httpError(404, 'NOT_FOUND', 'Milestone not found.');
    await changeLog(access, project, 'milestone.updated', milestoneId, session);
    return { milestoneId, ...patch };
  }));

  router.post('/:clubId/projects/:projectId/tasks', mutate(async (req, session) => {
    const access = await accessFor(req, session);
    const project = await projectFor(access, req.params.projectId, session);
    const input = createTask.parse(req.body ?? {});
    const canManage = access.isOfficer || (project.leadIds || []).includes(access.actor.id);
    if (!canManage && input.assigneeId && input.assigneeId !== access.actor.id) {
      throw httpError(403, 'ASSIGNMENT_NOT_ALLOWED', 'Members may only assign tasks to themselves.');
    }
    const assigneeId = canManage ? input.assigneeId : access.actor.id;
    await memberInClub(assigneeId, access, session);
    await milestoneInProject(input.milestoneId, access, project, session);
    const now = new Date().toISOString();
    const task = { id: 'task-' + randomUUID(), clubId: access.clubId, projectId: project.id,
      ...input, assigneeId, createdBy: access.actor.id, createdAt: now, updatedAt: now, version: 0 };
    await db.collection('projectTasks').insertOne(task, { session });
    await changeLog(access, project, 'task.created', task.id, session);
    return { task: cleanTask(task) };
  }, 201));

  router.patch('/:clubId/projects/:projectId/tasks/:taskId', mutate(async (req, session) => {
    const access = await accessFor(req, session);
    const project = await projectFor(access, req.params.projectId, session);
    const taskId = id.parse(req.params.taskId);
    const task = await db.collection('projectTasks').findOne({
      id: taskId, clubId: access.clubId, projectId: project.id
    }, { session });
    if (!task) throw httpError(404, 'NOT_FOUND', 'Task not found.');
    const canManage = access.isOfficer || (project.leadIds || []).includes(access.actor.id);
    const { expectedVersion, ...fields } = editTask.parse(req.body ?? {});
    const patch = requirePatch(fields);
    if (!canManage) {
      if (task.assigneeId !== access.actor.id) throw httpError(403, 'TASK_PERMISSION_REQUIRED', 'Only assigned members can update this task.');
      if (Object.keys(patch).some(key => !['status', 'evidenceUrl'].includes(key))) {
        throw httpError(403, 'TASK_PERMISSION_REQUIRED', 'Assigned members can update status and evidence only.');
      }
    }
    if ('assigneeId' in patch) await memberInClub(patch.assigneeId, access, session);
    if ('milestoneId' in patch) await milestoneInProject(patch.milestoneId, access, project, session);
    const currentVersion = task.version ?? 0;
    if (currentVersion !== expectedVersion) {
      throw httpError(409, 'TASK_CHANGED', 'The task changed. Refresh and retry.');
    }
    const filter = { id: taskId, clubId: access.clubId, projectId: project.id,
      version: task.version === undefined ? { $exists: false } : expectedVersion,
      ...(canManage ? {} : { assigneeId: access.actor.id }) };
    const version = expectedVersion + 1;
    const updatedAt = new Date().toISOString();
    const result = await db.collection('projectTasks').updateOne(filter,
      { $set: { ...patch, updatedAt, version } }, { session });
    if (!result.matchedCount) throw httpError(409, 'TASK_CHANGED', 'The task changed. Refresh and retry.');
    await changeLog(access, project, 'task.updated', taskId, session);
    return { taskId, ...patch, version, updatedAt };
  }));

  router.post('/:clubId/projects/:projectId/updates', mutate(async (req, session) => {
    const access = await accessFor(req, session);
    const project = await projectFor(access, req.params.projectId, session);
    const input = createUpdate.parse(req.body ?? {});
    // A decision reads as an official club record, so it requires a lead/officer.
    if (input.type === 'decision') assertManager(access, project);
    const update = { id: 'project-update-' + randomUUID(), clubId: access.clubId,
      projectId: project.id, ...input, authorId: access.actor.id, createdAt: new Date().toISOString() };
    await db.collection('projectUpdates').insertOne(update, { session });
    await changeLog(access, project, 'update.created', update.id, session);
    return { update: clean(update) };
  }, 201));

  // Portable, read-only handoff export. No separate AI service or paid dependency.
  router.get('/:clubId/projects/:projectId/handoff', async (req, res) => {
    const access = await accessFor(req);
    const project = await projectFor(access, req.params.projectId);
    const scope = { clubId: access.clubId, projectId: project.id };
    // The export is complete or explicitly rejected, never silently truncated.
    const exportLimit = 5000;
    const [milestones, tasks, updates] = await Promise.all([
      db.collection('projectMilestones').find(scope).sort({ createdAt: 1, id: 1 }).limit(exportLimit + 1).toArray(),
      db.collection('projectTasks').find(scope).sort({ createdAt: 1, id: 1 }).limit(exportLimit + 1).toArray(),
      db.collection('projectUpdates').find(scope).sort({ createdAt: -1, id: 1 }).limit(exportLimit + 1).toArray()
    ]);
    if ([milestones, tasks, updates].some(rows => rows.length > exportLimit)) {
      throw httpError(413, 'HANDOFF_TOO_LARGE', 'Handoff exceeds 5000 records in a section; use the paginated workspace.');
    }
    const safe = value => String(value || '').replace(/[\r\n]+/g, ' ').trim();
    const lines = ['# ' + safe(project.name), '', safe(project.description), '', 'Status: ' + project.status,
      'Target date: ' + (project.targetDate || 'Not set'), '', '## Milestones', ''];
    lines.push(...(milestones.length ? milestones.map(m => '- [' + (m.status === 'done' ? 'x' : ' ') + '] ' + safe(m.title) + ' (' + m.status + ', due ' + (m.dueDate || 'TBD') + ')') : ['No milestones recorded.']));
    lines.push('', '## Tasks', '');
    lines.push(...(tasks.length ? tasks.map(t => '- [' + (t.status === 'done' ? 'x' : ' ') + '] ' + safe(t.title) + ' — ' + t.status + ', assigned: ' + (t.assigneeId || 'unassigned') + ', due: ' + (t.dueDate || 'TBD') + (t.evidenceUrl ? ', evidence: ' + t.evidenceUrl : '')) : ['No tasks recorded.']));
    lines.push('', '## Decisions and updates', '');
    lines.push(...(updates.length ? updates.map(u => '- ' + u.createdAt.slice(0, 10) + ' [' + u.type + '] ' + safe(u.content)) : ['No project updates recorded.']));
    send(res, { filename: 'ithaca-handoff-' + project.id + '.md', markdown: lines.join('\n') });
  });
  return router;
}
