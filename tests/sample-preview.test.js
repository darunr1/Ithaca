import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLE_NOTICE, sampleUniversities, sampleClubs, sampleMembers,
  sampleContributions, sampleSessions, sampleAttendance, sampleLedger, sampleCourt
} from '../frontend/shared/sample-preview.js';
import { sampleHomePage, sampleLedgerPage, sampleCourtPage, sampleBowPage } from '../frontend/shared/sample-pages.js';

test('sample preview is populated, clearly fictional and never stores student credentials', () => {
  assert.equal(sampleUniversities.length, 2);
  assert.equal(sampleClubs.length, 6);
  assert.equal(sampleMembers.length, 32);
  assert.equal(sampleContributions.length, 69);
  assert.equal(sampleSessions.length, 21);
  assert.equal(sampleAttendance.length, 116);
  assert.match(SAMPLE_NOTICE, /fictional contributions and rankings/i);
  for (const records of [sampleUniversities, sampleClubs, sampleMembers, sampleContributions, sampleSessions, sampleAttendance]) {
    assert.equal(new Set(records.map(record => record.id)).size, records.length);
  }
  assert.ok(sampleMembers.every(member => member.sample && !member.email && !member.supabaseUserId));
  assert.ok(sampleContributions.every(record => record.sample && record.source.excerpt.includes('Illustrative sample')));
});

test('sample contribution records have consistent membership, valid points and no self-approval', () => {
  const members = new Map(sampleMembers.map(member => [member.id, member]));
  const clubs = new Map(sampleClubs.map(club => [club.id, club]));
  for (const record of sampleContributions) {
    const owner = members.get(record.memberId);
    assert.ok(owner, 'Every example contribution belongs to an example member');
    assert.ok(owner.clubIds.includes(record.clubId));
    assert.equal(clubs.get(record.clubId).universityId, record.universityId);
    assert.notEqual(record.memberId, record.approvedBy);
    assert.ok([30, 60, 90].includes(record.points));
    assert.equal(record.status, 'approved');
    assert.match(record.date, /^2026-\d\d-\d\d$/);
  }
  for (const attendance of sampleAttendance) {
    assert.ok(members.get(attendance.memberId).clubIds.includes(attendance.clubId));
    assert.equal(attendance.points, 10);
    assert.ok(sampleSessions.some(session => session.id === attendance.sessionId && session.clubId === attendance.clubId));
  }
});

test('sample Ledger and Court compute scores from sample events, not hardcoded rankings', () => {
  const result = sampleLedger('sample-ithaca');
  assert.equal(result.members.length, 7);
  assert.equal(result.contributions.length, 19);
  assert.equal(result.sessions.length, 5);
  const total = result.members.reduce((sum, member) => sum + member.points, 0);
  const contributions = result.contributions.reduce((sum, entry) => sum + entry.points, 0);
  assert.equal(total, contributions + sampleAttendance.filter(entry => entry.clubId === 'sample-ithaca').reduce((sum, entry) => sum + entry.points, 0));
  assert.ok(result.members.every((member, i, all) => i === 0 || all[i - 1].points >= member.points));
  assert.equal(sampleCourt('clubs', 'sample-ithaca').rows.length, 7);
  assert.equal(sampleCourt('university', 'sample-ithaca', 'sample-uta').rows.length, 15);
  assert.equal(sampleCourt('global').rows.length, 32);
  assert.deepEqual(sampleCourt('global').universities.map(row => row.contributions).reduce((a, b) => a + b, 0), sampleContributions.length);
});

test('sample preview surfaces stay clearly labeled and provide a switch back to live data', () => {
  for (const html of [sampleLedgerPage(), sampleCourtPage(), sampleCourtPage({ mode: 'university' }), sampleCourtPage({ mode: 'global' }), sampleBowPage()]) {
    assert.match(html, /DEMO DATA/);
    assert.match(html, /data-sample-show-live/);
    assert.match(html, /not real|not verified|not affect|illustrative|sample/i);
    assert.doesNotMatch(html, /data-review="approve"|data-reject-contribution/);
  }
  assert.match(sampleLedgerPage(), /Darun \(sample\)/);
  assert.match(sampleCourtPage(), /UT Dallas \(sample\)/);
});


test('all sample clubs have multiple people and evidence, with no real-account actions', () => {
  for (const club of sampleClubs) {
    const ledger = sampleLedger(club.id);
    assert.ok(ledger.members.length >= 4, club.name);
    assert.ok(ledger.contributions.length >= 2, club.name);
    assert.ok(ledger.sessions.length >= 1, club.name);
  }
  const home = sampleHomePage();
  assert.match(home, /DEMO DATA/);
  assert.match(home, /32/);
  assert.match(home, /#kleos/);
  const bow = sampleBowPage();
  assert.match(bow, /sample|fictional|example/i);
  assert.match(bow, /Project Knowledge Lead/);
  assert.doesNotMatch(bow, /data-bow-nominate|data-bow-appoint|data-review="approve"/);
});
