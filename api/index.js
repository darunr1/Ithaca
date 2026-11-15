import { readConfig } from '../backend/config.js';
import { connectDatabase } from '../database/connection.js';
import { createApp } from '../backend/app.js';
import { setupAthene } from '../backend/athene/repository.js';

let appPromise;
async function getApp() {
  if (!appPromise) appPromise = (async () => {
    const config = readConfig({ ...process.env, HOST: '127.0.0.1', NODE_ENV: 'production' });
    const connection = await connectDatabase(config);
    if (config.ATHENE_ENABLED) await setupAthene(connection.db, config);
    return createApp({ config, db: connection.db });
  })();
  return appPromise;
}

export default async function handler(req, res) {
  try { (await getApp())(req, res); }
  catch (error) { res.status(500).json({ error: { code: error.code || 'STARTUP_FAILED', message: error.message } }); }
}
