import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../config/database.js';
import { config } from '../config/env.js';
import { CryptoService } from '../services/crypto.service.js';
import { UrlService } from '../services/url.service.js';
import { AuthorizationService } from '../services/authorization.service.js';
import { AuditService } from '../services/audit.service.js';

export const pairChallengeSchema = z.object({
  body: z.object({
    code: z.string().min(6).max(12),
    deviceName: z.string().optional().default('Chrome Browser Companion'),
  }),
});

export const querySchema = z.object({
  query: z.object({
    url: z.string().min(1, 'Target tab URL is required'),
  }),
});

export class ExtensionController {
  /**
   * Web Dashboard generates short-lived 8-character pairing code
   */
  static async generateChallenge(req, res, next) {
    try {
      // 1. Generate 8-character alphanumeric code (e.g., PM-7241-AB)
      const rawCode = `PM-${Math.floor(1000 + Math.random() * 9000)}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;
      const codeHash = CryptoService.hashToken(rawCode);

      // Invalidate any prior unused challenges for this user
      await db.query(
        'UPDATE extension_pairing_challenges SET is_used = TRUE WHERE user_id = $1 AND is_used = FALSE',
        [req.user.id]
      );

      // Store in DB with 5-minute TTL
      const query = `
        INSERT INTO extension_pairing_challenges (user_id, challenge_code_hash, expires_at, is_used)
        VALUES ($1, $2, NOW() + INTERVAL '5 minutes', FALSE)
        RETURNING id, expires_at
      `;
      const result = await db.query(query, [req.user.id, codeHash]);

      res.json({
        pairingCode: rawCode,
        expiresAt: result.rows[0].expires_at,
        message: 'Enter this pairing code in your Chrome Extension within 5 minutes.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Chrome Extension exchanges pairing challenge code for dedicated extension token
   */
  static async exchangeChallenge(req, res, next) {
    try {
      const { code, deviceName } = req.validated.body;
      const codeHash = CryptoService.hashToken(code.trim());

      // Find valid, unused, unexpired challenge
      const findQuery = `
        SELECT id, user_id FROM extension_pairing_challenges
        WHERE challenge_code_hash = $1
          AND is_used = FALSE
          AND expires_at > NOW()
      `;
      const challengeRes = await db.query(findQuery, [codeHash]);

      if (challengeRes.rowCount === 0) {
        return res.status(400).json({ error: 'Invalid or expired pairing code. Please generate a new one.' });
      }

      const { id: challengeId, user_id: userId } = challengeRes.rows[0];

      // Invalidate challenge immediately (Single-use guarantee)
      await db.query('UPDATE extension_pairing_challenges SET is_used = TRUE WHERE id = $1', [challengeId]);

      // Create new pairing session
      const pairingTokenSecret = CryptoService.generateToken(32);
      const pairingTokenHash = CryptoService.hashToken(pairingTokenSecret);

      const pairQuery = `
        INSERT INTO extension_pairings (user_id, device_name, pairing_token_hash, is_active)
        VALUES ($1, $2, $3, TRUE)
        RETURNING id, created_at
      `;
      const pairRes = await db.query(pairQuery, [userId, deviceName, pairingTokenHash]);
      const pairing = pairRes.rows[0];

      // Sign dedicated extension JWT
      const extensionToken = jwt.sign(
        { userId, pairingId: pairing.id, type: 'extension' },
        config.extensionJwtSecret,
        { expiresIn: config.extensionJwtExpiresIn }
      );

      const userRes = await db.query('SELECT email FROM users WHERE id = $1', [userId]);

      await AuditService.logEvent({
        userId,
        eventType: 'EXTENSION_LINKED',
        req,
        details: { deviceName, pairingId: pairing.id },
      });

      res.json({
        message: 'Extension linked successfully.',
        extensionToken,
        user: {
          email: userRes.rows[0].email,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extension queries matching credentials for current tab URL.
   * STRICT SECURITY:
   * 1. Scoped strictly to req.user.id (from extension token)
   * 2. Evaluates hostname matching
   * 3. NEVER decrypts or returns username or password here (Metadata ONLY)
   */
  static async queryCredentials(req, res, next) {
    try {
      const { url } = req.validated.query;

      // Extract candidate hostname from tab URL
      let tabHostname;
      try {
        tabHostname = new URL(url).hostname.toLowerCase();
      } catch {
        return res.status(400).json({ error: 'Invalid URL provided.' });
      }

      // Fetch user's credentials matching or potentially matching
      const query = `
        SELECT id, website_name, website_url, target_hostname, match_subdomains, category
        FROM credentials
        WHERE user_id = $1
      `;
      const result = await db.query(query, [req.user.id]);

      // Apply URL matching policy
      const matches = result.rows
        .filter((cred) => UrlService.isMatch(url, cred))
        .map((cred) => ({
          id: cred.id,
          websiteName: cred.website_name,
          category: cred.category,
        }));

      res.json({
        tabUrl: url,
        targetHostname: tabHostname,
        matchCount: matches.length,
        matches, // Strictly metadata only: { id, websiteName, category }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extension initiates a verification session for Restricted / High Sensitivity credentials.
   * Returns a local bridge URL (http://localhost:5173/verify?sessionId=...)
   */
  static async createVerificationSession(req, res, next) {
    try {
      const { credentialId } = req.body;
      if (!credentialId) {
        return res.status(400).json({ error: 'credentialId is required' });
      }

      const credRes = await db.query('SELECT id, category, website_name FROM credentials WHERE id = $1 AND user_id = $2', [
        credentialId,
        req.user.id,
      ]);

      if (credRes.rowCount === 0) {
        return res.status(404).json({ error: 'Credential not found.' });
      }

      const { category, website_name } = credRes.rows[0];

      // If shareable, return release token immediately
      if (category === 'SHAREABLE') {
        const releaseToken = await AuthorizationService.createReleaseToken(req.user.id, credentialId);
        return res.json({
          status: 'COMPLETED',
          category,
          websiteName: website_name,
          releaseToken,
        });
      }

      // Create pending verification session
      const session = await AuthorizationService.createVerificationSession(req.user.id, credentialId, category);

      res.json({
        sessionId: session.id,
        category,
        websiteName: website_name,
        verificationUrl: `${config.frontendUrl}/verify?sessionId=${session.id}`,
        status: 'PENDING',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extension polls status of verification session
   */
  static async getVerificationSessionStatus(req, res, next) {
    try {
      const { sessionId } = req.params;
      const session = await AuthorizationService.getVerificationSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Verification session expired or not found.' });
      }

      if (session.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized.' });
      }

      res.json({
        sessionId: session.id,
        status: session.status,
        category: session.category,
        releaseToken: session.status === 'COMPLETED' ? session.release_token : null,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List active extension pairings for user (for Web Dashboard)
   */
  static async listPairings(req, res, next) {
    try {
      const query = `
        SELECT id, device_name, is_active, created_at, last_accessed_at
        FROM extension_pairings
        WHERE user_id = $1
        ORDER BY last_accessed_at DESC
      `;
      const result = await db.query(query, [req.user.id]);
      res.json({ pairings: result.rows });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revoke an extension pairing
   */
  static async revokePairing(req, res, next) {
    try {
      const { id } = req.params;
      const query = 'UPDATE extension_pairings SET is_active = FALSE WHERE id = $1 AND user_id = $2 RETURNING id, device_name';
      const result = await db.query(query, [id, req.user.id]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Pairing not found.' });
      }

      await AuditService.logEvent({
        userId: req.user.id,
        eventType: 'EXTENSION_REVOKED',
        req,
        details: { pairingId: id, deviceName: result.rows[0].device_name },
      });

      res.json({ message: 'Extension pairing revoked successfully.' });
    } catch (error) {
      next(error);
    }
  }
}
