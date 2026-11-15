import express from 'express';
import { readConfig } from '../backend/config.js';
import { connectDatabase } from '../database/connection.js';
import { createApp } from '../backend/app.js';
import { logStartupFailure } from '../backend/startup-diagnostics.js';

let applicationPromise;
function getApplication() {
  if (!applicationPromise) {
    applicationPromise = (async () => {
      let stage = 'configuration';
      try {
        const config = readConfig({ ...process.env, HOST: '127.0.0.1', NODE_ENV: 'production' });
        stage = 'database';
        const connection = await connectDatabase(config);
        stage = 'application';
        return createApp({ config, db: connection.db });
      } catch (error) {
        error.startupStage = stage;
        throw error;
      }
    })().catch(error => {
      // Atlas outages can recover while a warm function instance is alive.
      // Do not permanently cache a rejected connection/bootstrap promise.
      applicationPromise = undefined;
      logStartupFailure(error, { stage: error.startupStage, env: process.env });
      throw error;
    });
  }
  return applicationPromise;
}

// Vercel's official Express adapter expects an exported Express application.
// The existing application remains the sole route implementation; this small
// gateway only performs one serverless-safe lazy bootstrap per warm instance.
const app = express();
app.use(async (req, res, next) => {
  try { (await getApplication())(req, res); }
  catch (error) { next(error); }
});
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const configurationError = error.startupStage === 'configuration' || error.configurationError;
  res.status(configurationError ? 503 : 500).json({
    error: {
      code: configurationError ? 'DEPLOYMENT_CONFIGURATION_ERROR' : 'STARTUP_FAILED',
      message: configurationError
        ? 'The server is not fully configured. Check the deployment environment and function logs.'
        : 'The server could not start. Check the function logs.'
    }
  });
});

export default app;
