import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFeedbackMarkup, projectEmptyMessage, runProjectSave } from '../frontend/core/projects.js';
test('empty and filtered states give distinct actionable messages',()=>{
  assert.match(projectEmptyMessage(false),/Add a task/);
  assert.match(projectEmptyMessage(true),/Clear filters/);
  const html=projectFeedbackMarkup('<unsafe>');
  assert.match(html,/role="status" aria-live="polite"/);
  assert.match(html,/role="alert"/);
  assert.match(html,/&lt;unsafe&gt;/);
});
test('failed save releases pending state and announces failure without success',async()=>{
  const calls=[];
  const result=await runProjectSave(async()=>{throw Error('Offline');},{
    pending:v=>calls.push(v),success:()=>calls.push('success'),failure:e=>calls.push(e.message)
  });
  assert.equal(result,false);
  assert.deepEqual(calls,[true,false,'Offline']);
});
test('successful save releases pending state and refreshes',async()=>{
  const calls=[];
  assert.equal(await runProjectSave(async()=>calls.push('write'),{pending:v=>calls.push(v),success:()=>calls.push('refresh'),failure:()=>calls.push('error')}),true);
  assert.deepEqual(calls,[true,'write',false,'refresh']);
});
