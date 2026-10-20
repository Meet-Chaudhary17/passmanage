import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const requiredKeys = ['JWT_SECRET', 'VAULT_MASTER_KEY', 'BIOMETRIC_ENCRYPTION_KEY', 'INTERNAL_SERVICE_KEY'];
for (const key of requiredKeys) {
  if (!process.env[key]) {
    console.warn(`[WARN] Missing environment variable ${key}. Generating temporary fallback for dev.`);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/passmanage',

  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret_must_be_configured_in_prod_1234567890',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || 'dev_refresh_secret_12345678901234567890',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',

  extensionJwtSecret: process.env.EXTENSION_JWT_SECRET || 'dev_extension_secret_12345678901234567890',
  extensionJwtExpiresIn: process.env.EXTENSION_JWT_EXPIRES_IN || '30m',

  vaultMasterKey: process.env.VAULT_MASTER_KEY || '03261e0e0004ac95dd18b0c3247e7ce10b356b55912d0b4437b32a907c48bf75',
  biometricEncryptionKey: process.env.BIOMETRIC_ENCRYPTION_KEY || 'f7c4362373a62b988b6959104c0c1691212e2779d6fbe5d01ee47e325d7a6802',
  internalServiceKey: process.env.INTERNAL_SERVICE_KEY || 'b0b2878e14f162a4587bdc154398f932ba9dc54d9dc9207894eba48cc52113a3',

  faceServiceUrl: process.env.FACE_SERVICE_URL || 'http://127.0.0.1:8000',
  faceDistanceMetric: process.env.FACE_DISTANCE_METRIC || 'cosine',
  faceVerificationThreshold: parseFloat(process.env.FACE_VERIFICATION_THRESHOLD || '0.68'),

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  rpName: process.env.RP_NAME || 'PassManage Local Vault',
  rpId: process.env.RP_ID || 'localhost',
  origin: process.env.ORIGIN || 'http://localhost:5173'
};
