import { api } from '../shared/api.js';
import { e } from '../shared/ui.js';

const state = { clubId: '', projectId: '', flash: '' };
const statuses = ['todo', 'in_progress', 'blocked', 'done'];
const labels = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' };
const enc = encodeURIComponent;
const path = () => '/organizations/' + enc(state.clubId) + '/projects';
const projectPath = () => path() + '/' + enc(state.projectId);
const formatDate = value => value ? e(value) : 'No deadline';
const option = (value, text, selected) => '<option value="' + e(value) + '"' + (selected ? ' selected' : '') + '>' + e(text) + '</option>';
const statusSelect = (value, values, id, disabled = false) =>
  '<select ' + id + (disabled ? ' disabled' : '') + '>' + values.map(v => option(v, labels[v] || v.replaceAll('_', ' '), v === value)).join('') + '</select>';
const empty = text => '<p class="project-empty">' + e(text) + '</p>';
const sampleData = [
  { title: 'Battery telemetry parser', status: 'done', owner: 'Example firmware member' },
  { title: 'Validate fault thresholds', status: 'in_progress', owner: 'Example test lead' },
  { title: 'Review sensor wiring', status: 'blocked', owner: 'Example hardware member' },
  { title: 'Document handoff procedure', status: 'todo', owner: 'Example officer' }
];

function samplePage() {
  const cards = statuses.map(status => '<section class="project-lane"><h3>' + e(labels[status]) + '</h3>' +
    sampleData.filter(task => task.status === status).map(task => '<article class="project-task"><strong>' + e(task.title) + '</strong><small>' + e(task.owner) + '</small></article>').join('') + '</section>').join('');
  return '<div class="module-page module-projects module-sample-page"><header class="module-hero"><div><span class="module-kicker">PROJECTS / FICTIONAL DEMO</span><h1>Keep every project moving.</h1><p>Organize engineering work, document progress, and make semester handoffs easier.</p></div></header>' +
    '<section class="module-sample-banner"><span class="module-sample-label">DEMO DATA</span><div><strong>Sample project board</strong><p>All tasks and identities below are invented. This preview is read-only and never writes data.</p></div></section>' +
    '<section class="module-panel"><div class="module-panel-head"><div><span>EXAMPLE ENGINEERING PROJECT</span><h2>Accumulator Telemetry System</h2></div><span class="module-sample-label">Illustrative</span></div>' +
    '<p>A fictional example of how a club could organize task ownership and progress.</p><div class="project-board">' + cards + '</div></section></div>';
}

function taskCard(task, roster, canEdit) {
  const member = roster.get(task.assigneeId);
  const editable = canEdit || task.assigneeId === state.actorId;
  const select = editable
    ? statusSelect(task.status, statuses, 'data-project-task-status="' + e(task.id) + '"')
    : '<span class="project-pill project-' + e(task.status) + '">' + e(labels[task.status]) + '</span>';
  const evidence = task.evidenceUrl
    ? '<a href="' + e(task.evidenceUrl) + '" target="_blank" rel="noopener noreferrer">View evidence</a>' : '';
  return '<article class="project-task"><strong>' + e(task.title) + '</strong>' +
    (task.description ? '<p>' + e(task.description) + '</p>' : '') +
    '<small>' + e(member?.name || (task.assigneeId ? 'Member' : 'Unassigned')) + ' · ' + formatDate(task.dueDate) + '</small>' +
    evidence + select + '</article>';
}

function detailPage(detail, clubs, isOfficer, roster) {
  const { project, milestones, tasks, updates, summary, permissions } = detail;
  const canManage = permissions.canManage;
  state.actorId = permissions.actorId;
  const rosterMap = new Map(roster.map(member => [member.id, member]));
  const statusCount = statuses.map(status => ({ status, count: tasks.filter(task => task.status === status).length }));
  const board = statuses.map(status => '<section class="project-lane"><h3>' + e(labels[status]) + ' <span>' +
    tasks.filter(task => task.status === status).length + '</span></h3>' +
    (tasks.filter(task => task.status === status).map(task => taskCard(task, rosterMap, canManage)).join('') || empty('No tasks')) + '</section>').join('');

  const createTask = '<form id="project-task-form" class="project-form"><h3>Add a task</h3>' +
    '<label>Task title<input name="title" minlength="3" maxlength="150" required placeholder="e.g. Test the CAN telemetry parser"></label>' +
    '<label>Description<textarea name="description" maxlength="3000" rows="2" placeholder="What does done look like?"></textarea></label>' +
    '<div class="project-form-row"><label>Assignee<select name="assigneeId">' +
    option('', canManage ? 'Unassigned' : 'Assign to myself', true) +
    (canManage ? roster.map(member => option(member.id, member.name, false)).join('') : '') + '</select></label>' +
    '<label>Due date<input type="date" name="dueDate"></label></div>' +
    '<label>Milestone<select name="milestoneId">' + option('', 'No milestone', true) + milestones.map(m => option(m.id, m.title, false)).join('') + '</select></label>' +
    '<button type="submit">Add task</button></form>';

  const milestoneRows = milestones.map(m => '<div class="project-milestone"><div><strong>' + e(m.title) + '</strong><small>' +
    formatDate(m.dueDate) + '</small></div>' +
    (canManage ? statusSelect(m.status, ['planned', 'in_progress', 'done'], 'data-project-milestone-status="' + e(m.id) + '"')
      : '<span class="project-pill">' + e(m.status) + '</span>') + '</div>').join('') || empty('No milestones yet.');

  const milestoneForm = canManage ? '<form id="project-milestone-form" class="project-form">' +
    '<h3>Add a milestone</h3><label>Title<input name="title" required minlength="3" maxlength="150" placeholder="e.g. Integration testing complete"></label>' +
    '<label>Due date<input type="date" name="dueDate"></label><button type="submit">Create milestone</button></form>' : '';

  const updateRows = updates.map(item => '<article class="project-update"><div><strong>' + e(item.type.replaceAll('_', ' ')) +
    '</strong><small>' + e(item.createdAt.slice(0, 10)) + '</small></div><p>' + e(item.content) + '</p></article>').join('') ||
    empty('No project notes yet. Record an update or a decision after your next meeting.');

  const updateForm = '<form id="project-update-form" class="project-form"><h3>Record a project update</h3>' +
    '<label>Entry type<select name="type">' + ['progress', 'decision', 'blocker', 'meeting'].map(v => option(v, v, v === 'progress')).join('') + '</select></label>' +
    '<label>Notes<textarea name="content" rows="3" minlength="5" maxlength="3000" required placeholder="What changed, what was decided, or what is blocked?"></textarea></label>' +
    '<button type="submit">Save update</button></form>';

  const projectStatus = canManage ? statusSelect(project.status, ['active', 'on_hold', 'completed', 'archived'],
    'data-project-status="true"') : '<span class="project-pill">' + e(project.status) + '</span>';

  return '<div class="module-page module-projects"><header class="module-hero"><div><span class="module-kicker">PROJECTS / CLUB WORKSPACE</span>' +
    '<h1>Keep every project moving.</h1><p>Track responsibilities, milestones, evidence, and decisions together.</p></div></header>' +
    clubPicker(clubs) + flash() +
    '<div class="project-top-row"><label for="project-picker">Project<select id="project-picker">' +
    state.projectList.map(item => option(item.id, item.name, item.id === project.id)).join('') + '</select></label>' +
    '<button type="button" id="project-handoff" class="secondary">Export handoff (.md)</button></div>' +
    '<section class="module-panel"><div class="module-panel-head"><div><span>PROJECT OVERVIEW</span><h2>' + e(project.name) + '</h2></div>' + projectStatus +
    '</div><p>' + e(project.description || 'No project description yet.') + '</p>' +
    '<div class="project-stats">' +
    '<div><strong>' + summary.totalTasks + '</strong><small>Tracked tasks</small></div>' +
    '<div><strong>' + summary.completedTasks + '</strong><small>Completed</small></div>' +
    '<div><strong>' + summary.blockedTasks + '</strong><small>Blocked</small></div>' +
    '<div><strong>' + summary.completionPercent + '%</strong><small>Task completion</small></div></div>' +
    '<div class="project-progress"><span style="width:' + summary.completionPercent + '%"></span></div>' +
    '<p class="project-muted">Target: ' + formatDate(project.targetDate) + ' · ' +
    (project.leadIds.length ? 'Leads: ' + project.leadIds.map(id => e(rosterMap.get(id)?.name || 'Member')).join(', ') : 'No leads assigned') +
    '</p></section>' +
    '<div class="project-section-heading"><h2>Task board</h2><small>' + statusCount.map(s => s.count + ' ' + labels[s.status]).join(' · ') + '</small></div>' +
    '<div class="project-board">' + board + '</div>' +
    '<div class="project-two-column"><section class="module-panel">' + createTask + '</section>' +
    '<section class="module-panel"><h2>Milestones</h2>' + milestoneRows + milestoneForm + '</section></div>' +
    '<section class="module-panel"><div class="module-panel-head"><div><span>DECISIONS / PROGRESS / BLOCKERS</span><h2>Project history</h2></div></div>' +
    '<div class="project-update-list">' + updateRows + '</div>' + updateForm + '</section>' +
    '<p class="module-disclaimer">This workspace contains your real club records. Updates are attributed to authenticated members. Completion is calculated from task status, not an AI estimate.</p>' +
    '</div>';
}

function clubPicker(clubs) {
  return clubs.length > 1 ? '<div class="module-context"><label for="projects-club-picker">Club</label><select id="projects-club-picker">' +
    clubs.map(club => option(club.id, club.name, club.id === state.clubId)).join('') + '</select></div>' : '';
}
function flash() {
  const value = state.flash;
  state.flash = '';
  return '<p id="project-status" role="status" class="project-feedback">' + e(value || '') + '</p>';
}

export async function renderProjects(input = {}) {
  if (input && typeof input === 'object') {
    if (typeof input.clubId === 'string') { state.clubId = input.clubId; state.projectId = ''; }
    if (typeof input.projectId === 'string') state.projectId = input.projectId;
    if (typeof input.flash === 'string') state.flash = input.flash;
  }
  const [{ data: me }, { data: clubs }] = await Promise.all([api('/auth/me'), api('/clubs')]);
  if (!me.profile) return samplePage();
  if (!clubs.length) return '<div class="module-page module-projects"><header class="module-hero"><div><h1>Start your club workspace.</h1><p>Create or join a club to track its projects.</p></div></header><a href="#home">Return to your workspace</a></div>';
  if (!clubs.some(club => club.id === state.clubId)) state.clubId = clubs[0].id;
  const club = clubs.find(item => item.id === state.clubId);
  const isOfficer = club.officerIds.includes(me.profile.internalMemberId);
  const { data: list } = await api(path());
  state.projectList = list.projects;
  if (!list.projects.some(project => project.id === state.projectId)) state.projectId = list.projects[0]?.id || '';
  const picker = clubPicker(clubs);
  const createForm = isOfficer ? '<form id="project-create-form" class="project-form"><h3>Create a project</h3>' +
    '<label>Name<input name="name" required minlength="3" maxlength="120" placeholder="e.g. Solar Vehicle Telemetry"></label>' +
    '<label>Description<textarea name="description" rows="3" maxlength="3000" placeholder="What is this project trying to accomplish?"></textarea></label>' +
    '<label>Target date<input name="targetDate" type="date"></label>' +
    '<button type="submit">Create project</button></form>' : '';

  if (!state.projectId) return '<div class="module-page module-projects"><header class="module-hero"><div><span class="module-kicker">PROJECTS</span><h1>Build together. Remember everything.</h1><p>Projects bring tasks, progress and decisions into one shared workspace.</p></div></header>' +
    picker + flash() + '<section class="module-panel"><h2>No projects yet</h2><p>Club officers can create your first project here.</p>' +
    createForm + '</section></div>';

  const [{ data: detail }, { data: roster }] = await Promise.all([
    api(projectPath()), api('/clubs/' + enc(state.clubId) + '/roster')
  ]);
  return detailPage(detail, clubs, isOfficer, roster);
}

export function bindProjects(root, rerender) {
  const feedback = message => {
    const status = root.querySelector('#project-status');
    if (status) status.textContent = message;
  };
  const save = async (operation, message) => {
    feedback('Saving…');
    try { await operation(); rerender({ flash: message }); }
    catch (error) { feedback(error.message || 'Unable to save changes.'); }
  };
  root.querySelector('#projects-club-picker')?.addEventListener('change', event => rerender({ clubId: event.target.value }));
  root.querySelector('#project-picker')?.addEventListener('change', event => rerender({ projectId: event.target.value }));
  root.querySelector('#project-create-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    save(async () => {
      const { data: response } = await api(path(), { method: 'POST', body: {
        name: data.name, description: data.description, targetDate: data.targetDate || null
      } });
      state.projectId = response.project.id;
    }, 'Project created.');
  });
  root.querySelector('#project-task-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    save(() => api(projectPath() + '/tasks', { method: 'POST', body: {
      title: data.title, description: data.description, assigneeId: data.assigneeId || null,
      milestoneId: data.milestoneId || null, dueDate: data.dueDate || null
    } }), 'Task created.');
  });
  root.querySelector('#project-milestone-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    save(() => api(projectPath() + '/milestones', { method: 'POST', body: {
      title: data.title, dueDate: data.dueDate || null
    } }), 'Milestone created.');
  });
  root.querySelector('#project-update-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    save(() => api(projectPath() + '/updates', { method: 'POST', body: data }), 'Project update recorded.');
  });
  root.querySelector('[data-project-status]')?.addEventListener('change', event =>
    save(() => api(projectPath(), { method: 'PATCH', body: { status: event.target.value } }), 'Project status updated.'));
  root.querySelectorAll('[data-project-task-status]').forEach(select => select.addEventListener('change', event =>
    save(() => api(projectPath() + '/tasks/' + enc(select.dataset.projectTaskStatus), {
      method: 'PATCH', body: { status: event.target.value }
    }), 'Task status updated.')));
  root.querySelectorAll('[data-project-milestone-status]').forEach(select => select.addEventListener('change', event =>
    save(() => api(projectPath() + '/milestones/' + enc(select.dataset.projectMilestoneStatus), {
      method: 'PATCH', body: { status: event.target.value }
    }), 'Milestone updated.')));
  root.querySelector('#project-handoff')?.addEventListener('click', async () => {
    try {
      feedback('Preparing handoff…');
      const { data } = await api(projectPath() + '/handoff');
      const url = URL.createObjectURL(new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      feedback('Handoff exported.');
    } catch (error) { feedback(error.message || 'Export failed.'); }
  });
}
