import { readConfig } from '../backend/config.js';
import { connectDatabase } from './connection.js';
import { setupCollections } from './definitions.js';
import { fixtures } from '../demo-data/fixtures.js';
const config = readConfig();
if (config.DATA_MODE !== 'atlas' || !config.MONGODB_DB.endsWith('_demo')) throw new Error('Seeding requires Atlas mode and a database name ending in _demo.');
const connection = await connectDatabase(config);
try {
  await setupCollections(connection.db);
  for (const [collection, records] of Object.entries(fixtures)) {
    for (const record of records) await connection.db.collection(collection).updateOne({ id: record.id }, { $setOnInsert: record }, { upsert: true });
  }
  console.log('Fictional records seeded without overwriting existing records.');
} finally { await connection.close(); }
