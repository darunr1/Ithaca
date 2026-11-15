import { MongoClient } from 'mongodb';
const cached = globalThis.__ithacaMongoConnections ??= new Map();
export async function connectDatabase(config) {
  if (config.DATA_MODE === 'demo') return { db: null, close: async () => {} };
  const key = `${config.MONGODB_URI}\n${config.MONGODB_DB}`;
  if (cached.has(key)) return cached.get(key);
  const pending = connectFresh(config);
  cached.set(key, pending);
  try { return await pending; } catch (error) { cached.delete(key); throw error; }
}
async function connectFresh(config) {
  const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db(config.MONGODB_DB);
    await db.command({ ping: 1 });
    return { db, close: () => client.close() };
  } catch (error) {
    await client.close();
    throw new Error('Atlas connection failed; no demo fallback was used.', { cause: error });
  }
}
