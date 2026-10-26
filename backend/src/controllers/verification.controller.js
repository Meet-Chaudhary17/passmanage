import { z } from 'zod';
import { db } from '../config/database.js';
import { AuthorizationService } from '../services/authorization.service.js';
import { FaceService } from '../services/face.service.js';
import { CryptoService } from '../services/crypto.service.js';
import { WebAuthnService } from '../services/webauthn.service.js';
import { AuditService } from '../services/audit.service.js';
import { EmailService } from '../services/email.service.js';

export const sessionFaceSchema = z.object({
  body: z.object({
    imageBase64: z.string().min(50, 'Image data is required'),
  }),
});

export class VerificationController {
  /**
   * Get session details for localhost /verify bridge
   */
  static async getSession(req, res, next) {
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
        category: session.category,
        websiteName: session.website_name,
        targetHostname: session.target_hostname,
        status: session.status,
        faceVerified: session.face_verified,
        passkeyVerified: session.passkey_verified,
        expiresAt: session.expires_at,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Complete Face Verification for session
   */
  static async verifySessionFace(req, res, next) {
    try {
      const { sessionId } = req.params;
      const { imageBase64 } = req.validated.body;

      const session = await AuthorizationService.getVerificationSession(sessionId);
      if (!session || session.user_id !== req.user.id) {
        return res.status(404).json({ error: 'Session not found or unauthorized.' });
      }

      // Fetch enrolled template
      const templateRes = await db.query(
        'SELECT encrypted_embedding, iv, auth_tag FROM face_templates WHERE user_id = $1',
        [req.user.id]
      );
      if (templateRes.rowCount === 0) {
        return res.status(400).json({ error: 'No enrolled face template found.' });
      }

      const { encrypted_embedding, iv, auth_tag } = templateRes.rows[0];
      const enrolledEmbedding = CryptoService.decryptBiometricEmbedding(
        req.user.id,
        encrypted_embedding,
        iv,
        auth_tag
      );

      // Verify via Python service
      const verifyResult = await FaceService.verifyFace(imageBase64, enrolledEmbedding);

      if (!verifyResult.verified) {
        const isSpoof = verifyResult.is_real === false || verifyResult.spoof_detected === true;
        const failureReason = isSpoof ? 'BIOMETRIC_SPOOF_ATTACK_DETECTED' : 'INTRUDER_FACE_MISMATCH';

        // Log verification failure
        await AuditService.logEvent({
          userId: req.user.id,
          eventType: 'FACE_VERIFY_FAILURE',
          req,
          details: {
            sessionId,
            distance: verifyResult.distance,
            threshold: verifyResult.threshold,
            isReal: verifyResult.is_real,
            livenessScore: verifyResult.liveness_score,
            failureReason,
          },
        });

        // Log suspicious access denied
        await AuditService.logEvent({
          userId: req.user.id,
          eventType: 'SUSPICIOUS_ACCESS_DENIED',
          req,
          details: {
            reason: failureReason,
            sessionId,
            targetHostname: session.target_hostname,
            distance: verifyResult.distance,
            livenessScore: verifyResult.liveness_score,
          },
        });

        // Silently notify the registered account owner with intruder photograph or spoof snapshot
        try {
          const userRes = await db.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
          const userEmail = userRes.rows[0]?.email;
          if (userEmail) {
            EmailService.sendIntruderAlert({
              to: userEmail,
              websiteName: session.website_name || 'Companion Autofill',
              targetHostname: session.target_hostname || 'localhost',
              ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
              userAgent: req.headers['user-agent'] || 'Browser Client',
              timestamp: new Date(),
              intruderImageBase64: verifyResult.intruder_face_crop || imageBase64,
              alertType: isSpoof ? 'SPOOF_PHOTO_ATTACK' : 'INTRUDER_MISMATCH',
            }).catch((emailErr) => {
              console.error('[SECURITY ALERT] Failed to send intruder email:', emailErr);
            });
          }
        } catch (alertErr) {
          console.error('[SECURITY ALERT] Error preparing intruder alert dispatch:', alertErr);
        }

        const errorMessage = isSpoof
          ? 'Biometric liveness verification failed. Live human presence is required (photo or digital screen presentation detected).'
          : 'Face verification failed. Please try again.';

        return res.status(403).json({
          error: errorMessage,
          isReal: verifyResult.is_real,
          distance: verifyResult.distance,
        });
      }

      await AuditService.logEvent({
        userId: req.user.id,
        eventType: 'FACE_VERIFY_SUCCESS',
        req,
        details: { sessionId, distance: verifyResult.distance },
      });

      // Update session state
      const result = await AuthorizationService.markSessionFaceVerified(sessionId);

      res.json({
        message: 'Face verified successfully.',
        completed: result.completed,
        nextStep: result.nextStep,
        status: result.session.status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Passkey Authentication Options for session
   */
  static async getSessionPasskeyOptions(req, res, next) {
    try {
      const { sessionId } = req.params;
      const session = await AuthorizationService.getVerificationSession(sessionId);
      if (!session || session.user_id !== req.user.id) {
        return res.status(404).json({ error: 'Session not found or unauthorized.' });
      }

      const options = await WebAuthnService.getAuthenticationOptions(req.user.id);
      res.json(options);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Complete Passkey Verification for session
   */
  static async verifySessionPasskey(req, res, next) {
    try {
      const { sessionId } = req.params;
      const session = await AuthorizationService.getVerificationSession(sessionId);
      if (!session || session.user_id !== req.user.id) {
        return res.status(404).json({ error: 'Session not found or unauthorized.' });
      }

      const verified = await WebAuthnService.verifyAuthentication(req.user.id, req.body);
      if (!verified) {
        await AuditService.logEvent({
          userId: req.user.id,
          eventType: 'PASSKEY_AUTH_FAILURE',
          req,
          details: { sessionId },
        });
        return res.status(403).json({ error: 'Passkey verification failed.' });
      }

      await AuditService.logEvent({
        userId: req.user.id,
        eventType: 'PASSKEY_AUTH_SUCCESS',
        req,
        details: { sessionId },
      });

      const result = await AuthorizationService.markSessionPasskeyVerified(sessionId);

      res.json({
        message: 'Passkey verified successfully.',
        completed: true,
        status: result.session.status,
      });
    } catch (error) {
      next(error);
    }
  }
}
