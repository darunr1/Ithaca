import { readConfig } from '../backend/config.js';
import { connectDatabase } from '../database/connection.js';
import { setupAthene, vectorDefinition } from '../backend/athene/repository.js';
const config = readConfig();
if (config.DATA_MODE !== 'atlas') throw new Error('Set DATA_MODE=atlas.');
const connection = await connectDatabase(config);
try {
  await setupAthene(connection.db, config, true);
  console.log(`Athene collections ready. Atlas index ${config.MONGODB_VECTOR_INDEX} requested; wait for READY/queryable.`);
  console.log(JSON.stringify(vectorDefinition(config), null, 2));
} finally { await connection.close(); }
