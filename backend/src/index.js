import app from './app.js';
import { config } from './config/env.js';

const server = app.listen(config.port, () => {
  console.log(`[BACKEND] PassManage API running on http://localhost:${config.port}`);
  console.log(`[BACKEND] Environment: ${config.nodeEnv}`);
});

process.on('SIGTERM', () => {
  console.log('[BACKEND] SIGTERM received. Closing HTTP server.');
  server.close(() => {
    console.log('[BACKEND] Server terminated.');
  });
});
