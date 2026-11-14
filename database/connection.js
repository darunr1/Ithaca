import { MongoClient } from 'mongodb';
export async function connectDatabase(config) {
  if (config.DATA_MODE === 'demo') return { db: null, close: async () => {} };
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
