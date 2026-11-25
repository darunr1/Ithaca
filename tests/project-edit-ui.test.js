import test from 'node:test';
import assert from 'node:assert/strict';
import { projectEditForm, projectEditPayload } from '../frontend/core/projects.js';
const project = { name: '<script>', description: 'A & B', targetDate: '2027-04-01', status: 'on_hold' };
test('project edit form is manager-only, escaped and prefilled', () => {
  assert.equal(projectEditForm(project, false), '');
  const html = projectEditForm(project, true);
  assert.match(html, /name="name"[^>]*value="&lt;script&gt;"/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /value="2027-04-01"/);
  assert.match(html, /value="on_hold" selected/);
});
test('project edit sends only permitted detail fields and clears the date', () => {
  assert.deepEqual(projectEditPayload({name:'New name',description:'',targetDate:'',status:'active',leadIds:['x']}), {name:'New name',description:'',targetDate:null,status:'active'});
});
