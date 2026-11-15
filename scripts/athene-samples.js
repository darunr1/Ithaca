import { mkdir, writeFile } from 'node:fs/promises';
import { sampleFiles } from './athene-sample-data.js';
const directory = new URL('../tests/fixtures/athene/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const file of sampleFiles()) await writeFile(new URL(file.originalname, directory), file.buffer);
console.log('Five fictional engineering samples written to tests/fixtures/athene.');
