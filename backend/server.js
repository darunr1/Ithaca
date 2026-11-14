import { readConfig } from './config.js';
import { connectDatabase } from '../database/connection.js';
import { createApp } from './app.js';
try {
  const config = readConfig();
  const connection = await connectDatabase(config);
  const server = createApp({ config, db: connection.db }).listen(config.PORT, config.HOST, () => {
    console.log(`Ithaca foundation: http://${config.HOST}:${config.PORT} | data=${config.DATA_MODE} | AI=${config.AI_MODE}`);
    console.log('Fictional-data development only. Authentication and write workflows are not implemented.');
  });
  server.on('error', async () => { console.error('Could not start HTTP server. Check HOST and PORT.'); await connection.close(); process.exitCode = 1; });
  const stop = () => server.close(async () => { await connection.close(); process.exit(0); });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
} catch (error) { console.error(error.message); process.exitCode = 1; }
