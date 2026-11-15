import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('student dashboard uses a top navigation shell without a connection status pill', () => {
  const html = file('../frontend/app.html');
  const workspace = file('../frontend/workspace.js');
  const app = file('../frontend/app.js');
  assert.match(html, /class="student-top-nav"/);
  assert.match(html, /data-student-view="overview"/);
  assert.match(html, /data-student-view="profile"/);
  assert.match(html, /data-student-view="resume"/);
  assert.match(html, /student-studio\.css/);
  for (const source of [html, workspace, app]) {
    assert.doesNotMatch(source, /id="connection"|querySelector\('#connection'\)|Secure session/);
  }
});

test('student studio keeps onboarding, resume and member ID interactions', () => {
  const workspace = file('../frontend/workspace.js');
  const styles = file('../frontend/student-studio.css');
  for (const item of [
    'me.onboardingRequired', 'function onboarding(', 'function studentHome(',
    'function bindStudentNavigation(', 'id="studio-resume"',
    'id="resume-update-form"', 'id="copy-member-id"',
    'resumeControls(profile)', 'aria-current', 'studio-id-card'
  ]) assert.ok(workspace.includes(item), `Missing student UI behavior: ${item}`);
  for (const cls of ['.studio-spotlight', '.studio-facts', '.studio-main-grid', '.student-top-nav']) {
    assert.ok(styles.includes(cls), `Missing design class: ${cls}`);
  }
  assert.match(styles, /@media\(max-width:570px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});
