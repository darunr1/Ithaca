import { MongoClient } from 'mongodb';
import { supportsTransactions, registerTransactionClient } from '../backend/services/transactions.js';
const cached = globalThis.__ithacaMongoConnections ??= new Map();
export async function connectDatabase(config) {
  if (config.DATA_MODE === 'demo') return { db: null, close: async () => {} };
  const key = `${config.MONGODB_URI}\n${config.MONGODB_DB}\n${config.AUTH_MODE}`;
  if (cached.has(key)) return cached.get(key);
  const pending = connectFresh(config);
  cached.set(key, pending);
  try { return await pending; } catch (error) { cached.delete(key); throw error; }
}
async function connectFresh(config) {
  let client;
  try {
    client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(config.MONGODB_DB);
    await db.command({ ping: 1 });
    if (config.AUTH_MODE === 'supabase') {
      const hello = await db.command({ hello: 1 });
      if (!supportsTransactions(hello)) {
        throw new Error('Project writes require MongoDB Atlas or a transaction-capable replica set/sharded cluster.');
      }
      registerTransactionClient(db, client);
    }
    return { db, close: async () => { cached.delete(`${config.MONGODB_URI}\n${config.MONGODB_DB}\n${config.AUTH_MODE}`); await client.close(); } };
  } catch (error) {
    await client?.close();
    throw Object.assign(new Error('Atlas connection failed; no demo fallback was used.', { cause: error }), {
      code: 'ATLAS_CONNECTION_FAILED',
      safeToLog: true
    });
  }
}
