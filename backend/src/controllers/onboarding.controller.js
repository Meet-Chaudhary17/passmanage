import { z } from 'zod';
import { db } from '../config/database.js';
import { FaceService } from '../services/face.service.js';
import { CryptoService } from '../services/crypto.service.js';
import { WebAuthnService } from '../services/webauthn.service.js';
import { AuditService } from '../services/audit.service.js';

export const faceEnrollSchema = z.object({
  body: z.object({
    imageBase64: z.string().min(50, 'Image data is required'),
  }),
});

export class OnboardingController {
  /**
   * Enroll Face Biometrics (ArcFace embedding generation & encrypted storage)
   */
  static async enrollFace(req, res, next) {
    try {
      const { imageBase64 } = req.validated.body;

      // 1. Call internal Python microservice
      const faceResult = await FaceService.detectAndEmbed(imageBase64);

      if (!faceResult.success || !faceResult.embedding) {
        return res.status(422).json({
          error: 'Face enrollment failed. Please ensure your face is well-lit and centered in the frame.',
        });
      }

      // 2. Encrypt 512-d float embedding vector at rest
      const { encryptedEmbedding, iv, authTag } = CryptoService.encryptBiometricEmbedding(
        req.user.id,
        faceResult.embedding
      );

      // 3. Upsert face template in database
      const query = `
        INSERT INTO face_templates (user_id, model_name, encrypted_embedding, iv, auth_tag, updated_at)
        VALUES ($1, 'ArcFace', $2, $3, $4, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          encrypted_embedding = EXCLUDED.encrypted_embedding,
          iv = EXCLUDED.iv,
          auth_tag = EXCLUDED.auth_tag,
          updated_at = NOW()
        RETURNING id, model_name, created_at, updated_at
      `;
      const result = await db.query(query, [req.user.id, encryptedEmbedding, iv, authTag]);

      // 4. Log security event
      await AuditService.logEvent({
        userId: req.user.id,
        eventType: 'FACE_ENROLL_SUCCESS',
        req,
        details: { model: 'ArcFace', vectorDimension: faceResult.embedding.length },
      });

      res.json({
        message: 'Face biometrics enrolled successfully.',
        template: {
          id: result.rows[0].id,
          modelName: result.rows[0].model_name,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * WebAuthn / Passkey Registration Options
   */
  static async getWebAuthnRegisterOptions(req, res, next) {
    try {
      const options = await WebAuthnService.getRegistrationOptions(req.user);
      res.json(options);
    } catch (error) {
      next(error);
    }
  }

  /**
   * WebAuthn / Passkey Verify Registration Response
   */
  static async verifyWebAuthnRegistration(req, res, next) {
    try {
      const savedCred = await WebAuthnService.verifyRegistration(req.user.id, req.body);

      await AuditService.logEvent({
        userId: req.user.id,
        eventType: 'PASSKEY_REGISTER_SUCCESS',
        req,
        details: { credentialId: savedCred.credential_id },
      });

      res.json({
        message: 'Passkey registered successfully.',
        credentialId: savedCred.credential_id,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Complete First-Time Onboarding
   */
  static async completeOnboarding(req, res, next) {
    try {
      const checkQuery = `
        SELECT
          EXISTS(SELECT 1 FROM face_templates WHERE user_id = $1) as has_face,
          EXISTS(SELECT 1 FROM webauthn_credentials WHERE user_id = $1) as has_passkey
      `;
      const checkRes = await db.query(checkQuery, [req.user.id]);
      const { has_face, has_passkey } = checkRes.rows[0];

      if (!has_face) {
        return res.status(400).json({ error: 'Face recognition enrollment must be completed.' });
      }
      if (!has_passkey) {
        return res.status(400).json({ error: 'Passkey registration must be completed.' });
      }

      await db.query('UPDATE users SET security_setup_completed = TRUE WHERE id = $1', [req.user.id]);

      res.json({
        message: 'Security onboarding completed successfully. Your vault is now ready.',
        securitySetupCompleted: true,
      });
    } catch (error) {
      next(error);
    }
  }
}
