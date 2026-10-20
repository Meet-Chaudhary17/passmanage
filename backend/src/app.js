import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { db } from './config/database.js';
import { FaceService } from './services/face.service.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';

import authRoutes from './routes/auth.routes.js';
import onboardingRoutes from './routes/onboarding.routes.js';
import vaultRoutes from './routes/vault.routes.js';
import extensionRoutes from './routes/extension.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import auditRoutes from './routes/audit.routes.js';

const app = express();

// Security headers
app.use(helmet());

// CORS configuration supporting frontend and Chrome extension
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, extension background workers)
      if (!origin) return callback(null, true);

      if (
        origin === config.frontendUrl ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('chrome-extension://')
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy blocked access from origin: ${origin}`));
    },
    credentials: true,
  })
);

// Body parsers (support camera snapshots up to 10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiter
app.use('/api/', apiLimiter);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'CONNECTED';
  try {
    await db.query('SELECT 1');
  } catch (err) {
    dbStatus = `DISCONNECTED: ${err.message}`;
  }

  const faceHealth = await FaceService.getHealth();

  res.json({
    status: 'ONLINE',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    faceMicroservice: faceHealth,
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/extension', extensionRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/audit', auditRoutes);

// Centralized error handler
app.use(errorHandler);

export default app;
