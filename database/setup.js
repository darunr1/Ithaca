import { readConfig } from '../backend/config.js';
import { connectDatabase } from './connection.js';
import { setupCollections } from './definitions.js';
const config = readConfig();
if (config.DATA_MODE !== 'atlas') throw new Error('Set DATA_MODE=atlas to install database validators and indexes.');
const connection = await connectDatabase(config);
try { await setupCollections(connection.db); console.log('Atlas collections, validators and indexes ready.'); }
finally { await connection.close(); }
