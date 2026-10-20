import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../config/database.js';
import { CryptoService } from '../services/crypto.service.js';
import { UrlService } from '../services/url.service.js';
import { AuthorizationService } from '../services/authorization.service.js';
import { FaceService } from '../services/face.service.js';
import { WebAuthnService } from '../services/webauthn.service.js';
import { AuditService } from '../services/audit.service.js';

export const createCredentialSchema = z.object({
  body: z.object({
    websiteName: z.string().min(1, 'Website name is required').max(128),
    websiteUrl: z.string().min(1, 'Website URL is required'),
    username: z.string().min(1, 'Username or email is required'),
    password: z.string().min(1, 'Password is required'),
    category: z.enum(['SHAREABLE', 'RESTRICTED', 'HIGH_SENSITIVITY']),
    matchSubdomains: z.boolean().optional().default(false),
    notes: z.string().optional().default(''),
  }),
});

export const verifyFaceSchema = z.object({
  body: z.object({
    imageBase64: z.string().min(50, 'Image data is required'),
  }),
});

export const releaseSchema = z.object({
  body: z.object({
    releaseToken: z.string().min(1, 'Release token is required'),
  }),
});

export class VaultController {
  /**
   * List user credentials (METADATA ONLY; strictly zero plaintext passwords or secrets)
   */
  static async listCredentials(req, res, next) {
    try {
      const query = `
        SELECT id, website_name, website_url, target_hostname, match_subdomains, category, created_at, updated_at
        FROM credentials
        WHERE user_id = $1
        ORDER BY created_at DESC
      `;
      const result = await db.query(query, [req.user.id]);
      res.json({ credentials: result.rows });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create new credential (Single-payload AES-256-GCM encryption)
   */
  static async createCredential(req, res, next) {
    try {
      const { websiteName, websiteUrl, username, password, category, matchSubdomains, notes } =
        req.validated.body;

      // 1. Validate & extract canonical hostname
      const { canonicalUrl, targetHostname } = UrlService.extractTargetHostname(websiteUrl);

      // 2. Generate unique credential UUID
      const credentialId = crypto.randomUUID();

      // 3. Encrypt single payload with AES-256-GCM + unique IV + AAD
      const { encryptedPayload, iv, authTag } = CryptoService.encryptCredentialPayload(
        req.user.id,
        credentialId,
        { username, password, notes }
      );

      // 4. Save in PostgreSQL
      const insertQuery = `
        INSERT INTO credentials (
          id, user_id, website_name, website_url, target_hostname, match_subdomains,
          category, encrypted_payload, iv, auth_tag
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, website_name, website_url, target_hostname, match_subdomains, category, created_at
      `;
      const values = [
        credentialId,
        req.user.id,
        websiteName,
        canonicalUrl,
        targetHostname,
        matchSubdomains,
        category,
        encryptedPayload,
        iv,
        authTag,
      ];
      const result = await db.query(insertQuery, values);
      const created = result.rows[0];

      // 5. Audit event
      await AuditService.logEvent({
        userId: req.user.id,
        eventType: 'CREDENTIAL_CREATED',
        req,
        details: {
          credentialId: created.id,
          websiteName: created.website_name,
          category: created.category,
        },
      });

      res.status(201).json({
        message: 'Credential securely saved in vault.',
        credential: created,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete credential
   */
  static async deleteCredential(req, res, next) {
    try {
      const { id } = req.params;
      const query = `
        DELETE FROM credentials
        WHERE id = $1 AND user_id = $2
        RETURNING id, website_name
      `;
      const result = await db.query(query, [id, req.user.id]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Credential not found or unauthorized.' });
      }

      await AuditService.logEvent({
        userId: req.user.id,
        eventType: 'CREDENTIAL_DELETED',
        req,
        details: { credentialId: id, websiteName: result.rows[0].website_name },
      });

      res.json({ message: 'Credential deleted successfully.' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Initiate progressive access request.
   * Loads category strictly from database (client input is not trusted).
   */
  static async initiateAccess(req, res, next) {
    try {
      const { id } = req.params;

      const credRes = await db.query('SELECT id, category, website_name FROM credentials WHERE id = $1 AND user_id = $2', [
        id,
        req.user.id,
      ]);

      if (credRes.rowCount === 0) {
        return res.status(404).json({ error: 'Credential not found or unauthorized.' });
      }

      const { category, website_name } = credRes.rows[0];

      // Enforce server-side security policy
      if (category === 'SHAREABLE') {
        const releaseToken = await AuthorizationService.createReleaseToken(req.user.id, id);
        return res.json({
          authorized: true,
          category,
          websiteName: website_name,
          releaseToken,
        });
      }

      // Restricted or High Sensitivity requires progressive authentication
      res.json({
        authorized: false,
        category,
        websiteName: website_name,
        requiredStep: 'FACE',
        message: 'Additional verification required.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Progressive Face Verification step
   */
  static async verifyFace(req, res, next) {
    try {
      const { id } = req.params;
      const { imageBase64 } = req.validated.body;

      // 1. Verify credential exists for user and load category
      const credRes = await db.query('SELECT id, category FROM credentials WHERE id = $1 AND user_id = $2', [
        id,
        req.user.id,
      ]);
      if (credRes.rowCount === 0) {
        return res.status(404).json({ error: 'Credential not found.' });
      }
      const { category } = credRes.rows[0];

      // 2. Fetch enrolled biometric template
      const templateRes = await db.query(
        'SELECT encrypted_embedding, iv, auth_tag FROM face_templates WHERE user_id = $1',
        [req.user.id]
      );
      if (templateRes.rowCount === 0) {
        return res.status(400).json({ error: 'No enrolled face template found. Please complete setup.' });
      }

      const { encrypted_embedding, iv, auth_tag } = templateRes.rows[0];
      const enrolledEmbedding = CryptoService.decryptBiometricEmbedding(
        req.user.id,
        encrypted_embedding,
        iv,
        auth_tag
      );

      // 3. Verify against live frame via Python Face microservice
      const verifyResult = await FaceService.verifyFace(imageBase64, enrolledEmbedding);

      if (!verifyResult.verified) {
        await AuditService.logEvent({
          userId: req.user.id,
          eventType: 'FACE_VERIFY_FAILURE',
          req,
          details: { credentialId: id, distance: verifyResult.distance, threshold: verifyResult.threshold },
        });
        return res.status(403).json({
          authorized: false,
          error: 'Face verification failed. Please try again.',
          distance: verifyResult.distance,
        });
      }

      // Log success
      await AuditService.logEvent({
        userId: req.user.id,
        eventType: 'FACE_VERIFY_SUCCESS',
        req,
        details: { credentialId: id, distance: verifyResult.distance },
      });

      // 4. Determine next step based on category
      if (category === 'RESTRICTED') {
        const releaseToken = await AuthorizationService.createReleaseToken(req.user.id, id);
        return res.json({
          authorized: true,
          faceVerified: true,
          releaseToken,
        });
      } else if (category === 'HIGH_SENSITIVITY') {
        return res.json({
          authorized: false,
          faceVerified: true,
          nextStep: 'PASSKEY',
          message: 'Face verified. Hardware passkey required to complete authorization.',
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * WebAuthn Options for High Sensitivity release
   */
  static async getPasskeyOptions(req, res, next) {
    try {
      const options = await WebAuthnService.getAuthenticationOptions(req.user.id);
      res.json(options);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify Passkey Assertion for High Sensitivity release
   */
  static async verifyPasskey(req, res, next) {
    try {
      const { id } = req.params;

      const credRes = await db.query('SELECT id, category FROM credentials WHERE id = $1 AND user_id = $2', [
        id,
        req.user.id,
      ]);
      if (credRes.rowCount === 0) {
        return res.status(404).json({ error: 'Credential not found.' });
      }

      const verified = await WebAuthnService.verifyAuthentication(req.user.id, req.body);
      if (!verified) {
        await AuditService.logEvent({
          userId: req.user.id,
          eventType: 'PASSKEY_AUTH_FAILURE',
          req,
          details: { credentialId: id },
        });
        return res.status(403).json({ error: 'Passkey verification failed.' });
      }

      await AuditService.logEvent({
        userId: req.user.id,
        eventType: 'PASSKEY_AUTH_SUCCESS',
        req,
        details: { credentialId: id },
      });

      const releaseToken = await AuthorizationService.createReleaseToken(req.user.id, id);
      res.json({
        authorized: true,
        passkeyVerified: true,
        releaseToken,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Release decrypted credential plaintext using valid single-use release token
   */
  static async releaseCredential(req, res, next) {
    try {
      const { id } = req.params;
      const { releaseToken } = req.validated.body;

      // 1. Consume single-use 30s release token from PostgreSQL
      const isValid = await AuthorizationService.validateAndConsumeReleaseToken(req.user.id, id, releaseToken);
      if (!isValid) {
        await AuditService.logEvent({
          userId: req.user.id,
          eventType: 'SUSPICIOUS_ACCESS_DENIED',
          req,
          details: { reason: 'Invalid, expired, or replayed release token', credentialId: id },
        });
        return res.status(403).json({
          error: 'Authorization token invalid or expired. Please re-authenticate.',
        });
      }

      // 2. Fetch encrypted ciphertext
      const credRes = await db.query(
        'SELECT encrypted_payload, iv, auth_tag, website_name, website_url FROM credentials WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (credRes.rowCount === 0) {
        return res.status(404).json({ error: 'Credential not found.' });
      }

      const { encrypted_payload, iv, auth_tag, website_name, website_url } = credRes.rows[0];

      // 3. Decrypt AES-256-GCM single payload
      const decrypted = CryptoService.decryptCredentialPayload(
        req.user.id,
        id,
        encrypted_payload,
        iv,
        auth_tag
      );

      // 4. Log access event
      await AuditService.logEvent({
        userId: req.user.id,
        eventType: 'CREDENTIAL_ACCESSED',
        req,
        details: { credentialId: id, websiteName: website_name },
      });

      // 5. Return plaintext credentials directly to authorized caller
      res.json({
        websiteName: website_name,
        websiteUrl: website_url,
        username: decrypted.username,
        password: decrypted.password,
        notes: decrypted.notes,
      });
    } catch (error) {
      next(error);
    }
  }
}
