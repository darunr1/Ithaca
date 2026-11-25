import test from 'node:test';
import assert from 'node:assert/strict';
import { taskFilterQuery } from '../frontend/core/projects.js';
test('task filters encode search and use authenticated mine instead of assignee',()=>{const q=new URLSearchParams(taskFilterQuery({q:'a & b',mine:'true',assignee:'other',sort:'title'}));assert.equal(q.get('q'),'a & b');assert.equal(q.get('mine'),'true');assert.equal(q.has('assignee'),false);});
