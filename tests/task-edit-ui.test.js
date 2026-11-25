import test from 'node:test';
import assert from 'node:assert/strict';
import { taskDetailsForm, taskEditPayload } from '../frontend/core/projects.js';
const task = { id:'t', title:'<task>', assigneeId:'a', milestoneId:'m', description:'a & b', version:4 };
const roster = new Map([['a',{id:'a',name:'Alice'}]]);
test('task details respect manager and assignee permissions', () => {
  assert.equal(taskDetailsForm(task, roster, [], false, 'other'), '');
  const owner = taskDetailsForm(task, roster, [], false, 'a');
  assert.match(owner, /name="evidenceUrl"/);
  assert.doesNotMatch(owner, /name="assigneeId"|name="description"|name="dueDate"/);
  const manager = taskDetailsForm(task, roster, [{id:'m',title:'Milestone'}], true, 'other');
  assert.match(manager, /&lt;task&gt;/);
  assert.match(manager, /value="m" selected/);
  assert.match(manager, /name="description"/);
});
test('task patch retains optimistic version and excludes manager fields for assignees', () => {
  const input = {description:'updated',assigneeId:'',milestoneId:'',dueDate:'',evidenceUrl:''};
  assert.deepEqual(taskEditPayload(input,false,4), {expectedVersion:4,evidenceUrl:null});
  assert.deepEqual(taskEditPayload(input,true,4), {expectedVersion:4,evidenceUrl:null,description:'updated',assigneeId:null,milestoneId:null,dueDate:null});
});
