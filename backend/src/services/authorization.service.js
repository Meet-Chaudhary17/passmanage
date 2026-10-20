import { db } from '../config/database.js';
import { CryptoService } from './crypto.service.js';

export class AuthorizationService {
  /**
   * Determine required security factors from category
   */
  static getPolicyRequirements(category) {
    switch (category) {
      case 'SHAREABLE':
        return {
          category,
          requiredFactors: ['SESSION'],
          description: 'Session authorization only',
        };
      case 'RESTRICTED':
        return {
          category,
          requiredFactors: ['SESSION', 'FACE'],
          description: 'Biometric face verification required',
        };
      case 'HIGH_SENSITIVITY':
        return {
          category,
          requiredFactors: ['SESSION', 'FACE', 'PASSKEY'],
          description: 'Biometric face verification and hardware passkey required',
        };
      default:
        throw new Error(`Unknown security category: ${category}`);
    }
  }

  /**
   * Generate persistent single-use 30-second release token stored in PostgreSQL
   */
  static async createReleaseToken(userId, credentialId) {
    const rawToken = CryptoService.generateToken(32);
    const authTokenHash = CryptoService.hashToken(rawToken);

    const query = `
      INSERT INTO release_authorizations (user_id, credential_id, auth_token_hash, expires_at, is_used)
      VALUES ($1, $2, $3, NOW() + INTERVAL '30 seconds', FALSE)
      RETURNING id, expires_at
    `;
    await db.query(query, [userId, credentialId, authTokenHash]);
    return rawToken;
  }

  /**
   * Validate and immediately consume single-use release token
   */
  static async validateAndConsumeReleaseToken(userId, credentialId, rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      return false;
    }

    const authTokenHash = CryptoService.hashToken(rawToken);

    // Atomically find valid token and mark it used in one transaction
    const updateQuery = `
      UPDATE release_authorizations
      SET is_used = TRUE
      WHERE user_id = $1
        AND credential_id = $2
        AND auth_token_hash = $3
        AND is_used = FALSE
        AND expires_at > NOW()
      RETURNING id
    `;
    const res = await db.query(updateQuery, [userId, credentialId, authTokenHash]);
    return res.rowCount > 0;
  }

  /**
   * Create verification session bridge for Extension -> Localhost Web verification page
   */
  static async createVerificationSession(userId, credentialId, category) {
    const query = `
      INSERT INTO verification_sessions (user_id, credential_id, category, status, expires_at)
      VALUES ($1, $2, $3, 'PENDING', NOW() + INTERVAL '3 minutes')
      RETURNING id, category, status, expires_at
    `;
    const res = await db.query(query, [userId, credentialId, category]);
    return res.rows[0];
  }

  /**
   * Get active verification session
   */
  static async getVerificationSession(sessionId) {
    const query = `
      SELECT v.*, c.website_name, c.target_hostname
      FROM verification_sessions v
      JOIN credentials c ON v.credential_id = c.id
      WHERE v.id = $1 AND v.expires_at > NOW()
    `;
    const res = await db.query(query, [sessionId]);
    return res.rows[0] || null;
  }

  /**
   * Record Face verification success on session
   */
  static async markSessionFaceVerified(sessionId) {
    const session = await this.getVerificationSession(sessionId);
    if (!session) throw new Error('Verification session not found or expired');

    if (session.category === 'RESTRICTED') {
      // Restricted only needs Face; generate release token now
      const releaseToken = await this.createReleaseToken(session.user_id, session.credential_id);
      const query = `
        UPDATE verification_sessions
        SET face_verified = TRUE, status = 'COMPLETED', release_token = $1
        WHERE id = $2
        RETURNING *
      `;
      const res = await db.query(query, [releaseToken, sessionId]);
      return { session: res.rows[0], completed: true, releaseToken };
    } else {
      // High sensitivity: advance to passkey step
      const query = `
        UPDATE verification_sessions
        SET face_verified = TRUE, status = 'FACE_VERIFIED'
        WHERE id = $1
        RETURNING *
      `;
      const res = await db.query(query, [sessionId]);
      return { session: res.rows[0], completed: false, nextStep: 'PASSKEY' };
    }
  }

  /**
   * Record Passkey verification success on session
   */
  static async markSessionPasskeyVerified(sessionId) {
    const session = await this.getVerificationSession(sessionId);
    if (!session) throw new Error('Verification session not found or expired');
    if (!session.face_verified && session.category === 'HIGH_SENSITIVITY') {
      throw new Error('Biometric face verification must precede passkey verification');
    }

    const releaseToken = await this.createReleaseToken(session.user_id, session.credential_id);
    const query = `
      UPDATE verification_sessions
      SET passkey_verified = TRUE, status = 'COMPLETED', release_token = $1
      WHERE id = $2
      RETURNING *
    `;
    const res = await db.query(query, [releaseToken, sessionId]);
    return { session: res.rows[0], completed: true, releaseToken };
  }
}
