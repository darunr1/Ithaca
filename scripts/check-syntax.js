import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await check(path);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (result.status) { console.error(result.stderr); process.exitCode = 1; }
    }
  }
}
for (const directory of ['backend', 'ai-service', 'database', 'frontend', 'scripts', 'tests']) await check(directory);
if (!process.exitCode) console.log('All backend, frontend, script and test JavaScript syntax checks passed.');
