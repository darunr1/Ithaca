import { readConfig } from './config.js';
import { connectDatabase } from '../database/connection.js';
import { createApp } from './app.js';
import { setupAthene } from './athene/repository.js';
try {
  const config = readConfig();
  const connection = await connectDatabase(config);
  try { if (config.ATHENE_ENABLED) await setupAthene(connection.db, config); }
  catch { await connection.close(); throw new Error('Athene collection/index initialization failed. Run npm run athene:setup and check database permissions.'); }
  const server = createApp({ config, db: connection.db }).listen(config.PORT, config.HOST, () => {
    console.log(`Ithaca foundation: http://${config.HOST}:${config.PORT} | data=${config.DATA_MODE} | AI=${config.AI_MODE}`);
    console.log(config.ATHENE_ENABLED ? 'Athene enabled with authenticated project routes. Other foundation routes still require shared authentication; use fictional data.' : 'Fictional-data development only. Foundation authentication and write workflows are not implemented.');
  });
  server.on('error', async () => { console.error('Could not start HTTP server. Check HOST and PORT.'); await connection.close(); process.exitCode = 1; });
  const stop = () => server.close(async () => { await connection.close(); process.exit(0); });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
} catch (error) { console.error(error.message); process.exitCode = 1; }
