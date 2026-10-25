import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../config/database.js';
import { config } from '../config/env.js';
import { CryptoService } from '../services/crypto.service.js';
import { AuditService } from '../services/audit.service.js';
import { EmailService } from '../services/email.service.js';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').max(255),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().min(4, 'Verification code is required').max(10),
  }),
});

export const resendOtpSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
  }),
});

export class AuthController {
  /**
   * Step 1: Initiate Registration & Dispatch Email OTP
   */
  static async requestOtp(req, res, next) {
    try {
      const { email, password } = req.validated.body;

      // 1. Check duplicate email
      const existingUser = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (existingUser.rowCount > 0) {
        return res.status(409).json({ error: 'An account with this email address already exists.' });
      }

      // 2. Hash password with Argon2id
      const passwordHash = await CryptoService.hashPassword(password);

      // 3. Generate secure 6-digit numeric OTP
      const otp = crypto.randomInt(100000, 1000000).toString();

      // 4. Save/update pending registration (10-minute expiry)
      const upsertQuery = `
        INSERT INTO pending_registrations (email, password_hash, otp_code, otp_expires_at, attempts, created_at)
        VALUES (LOWER($1), $2, $3, NOW() + INTERVAL '10 minutes', 0, NOW())
        ON CONFLICT (email)
        DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          otp_code = EXCLUDED.otp_code,
          otp_expires_at = EXCLUDED.otp_expires_at,
          attempts = 0,
          created_at = NOW();
      `;
      await db.query(upsertQuery, [email, passwordHash, otp]);

      // 5. Send OTP to user's email via Gmail SMTP
      await EmailService.sendRegistrationOtp(email, otp);

      res.status(200).json({
        success: true,
        message: 'A 6-digit verification code has been sent to your email. Please verify to complete vault creation.',
        email,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Alias for backward compatibility: /register initiates OTP flow
   */
  static async register(req, res, next) {
    return AuthController.requestOtp(req, res, next);
  }

  /**
   * Step 2: Verify Registration OTP & Create User
   */
  static async verifyOtp(req, res, next) {
    try {
      const { email, otp } = req.validated.body;

      const pendingRes = await db.query(
        'SELECT id, email, password_hash, otp_code, otp_expires_at, attempts FROM pending_registrations WHERE LOWER(email) = LOWER($1)',
        [email]
      );

      if (pendingRes.rowCount === 0) {
        return res.status(400).json({ error: 'No pending registration found for this email. Please sign up again.' });
      }

      const pending = pendingRes.rows[0];

      // Check expiry
      if (new Date() > new Date(pending.otp_expires_at)) {
        await db.query('DELETE FROM pending_registrations WHERE id = $1', [pending.id]);
        return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
      }

      // Check brute force attempts
      if (pending.attempts >= 5) {
        return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
      }

      // Check OTP match
      if (pending.otp_code.trim() !== otp.trim()) {
        await db.query('UPDATE pending_registrations SET attempts = attempts + 1 WHERE id = $1', [pending.id]);
        const remaining = 4 - pending.attempts;
        return res.status(400).json({
          error: `Invalid verification code. ${remaining > 0 ? remaining + ' attempt(s) remaining.' : 'Code locked. Please request a new code.'}`,
        });
      }

      // Ensure email wasn't taken
      const duplicateCheck = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (duplicateCheck.rowCount > 0) {
        await db.query('DELETE FROM pending_registrations WHERE id = $1', [pending.id]);
        return res.status(409).json({ error: 'An account with this email address already exists.' });
      }

      // Insert clean user record into users
      const insertQuery = `
        INSERT INTO users (email, password_hash, security_setup_completed)
        VALUES (LOWER($1), $2, FALSE)
        RETURNING id, email, security_setup_completed, created_at
      `;
      const result = await db.query(insertQuery, [email, pending.password_hash]);
      const user = result.rows[0];

      // Clean up pending registration
      await db.query('DELETE FROM pending_registrations WHERE id = $1', [pending.id]);

      // Log real security audit event
      await AuditService.logEvent({
        userId: user.id,
        eventType: 'REGISTRATION_SUCCESS',
        req,
        details: { email: user.email, verifiedVia: 'EMAIL_OTP' },
      });

      // Issue access token
      const token = jwt.sign(
        { userId: user.id, email: user.email, type: 'user' },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.status(201).json({
        message: 'Account registered and email verified successfully.',
        token,
        user: {
          id: user.id,
          email: user.email,
          securitySetupCompleted: user.security_setup_completed,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resend Registration OTP
   */
  static async resendOtp(req, res, next) {
    try {
      const { email } = req.validated.body;

      const pendingRes = await db.query(
        'SELECT id FROM pending_registrations WHERE LOWER(email) = LOWER($1)',
        [email]
      );

      if (pendingRes.rowCount === 0) {
        return res.status(400).json({ error: 'No pending registration found for this email. Please register again.' });
      }

      const otp = crypto.randomInt(100000, 1000000).toString();

      await db.query(
        `UPDATE pending_registrations
         SET otp_code = $1, otp_expires_at = NOW() + INTERVAL '10 minutes', attempts = 0
         WHERE LOWER(email) = LOWER($2)`,
        [otp, email]
      );

      await EmailService.sendRegistrationOtp(email, otp);

      res.json({ success: true, message: 'A new 6-digit verification code has been sent to your email.' });
    } catch (error) {
      next(error);
    }
  }

  static async login(req, res, next) {
    try {
      const { email, password } = req.validated.body;

      const userRes = await db.query(
        'SELECT id, email, password_hash, security_setup_completed FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );

      if (userRes.rowCount === 0) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const user = userRes.rows[0];
      const isPasswordValid = await CryptoService.verifyPassword(user.password_hash, password);

      if (!isPasswordValid) {
        await AuditService.logEvent({
          userId: user.id,
          eventType: 'LOGIN_FAILURE',
          req,
          details: { reason: 'Incorrect password' },
        });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      await AuditService.logEvent({
        userId: user.id,
        eventType: 'LOGIN_SUCCESS',
        req,
      });

      const token = jwt.sign(
        { userId: user.id, email: user.email, type: 'user' },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.json({
        message: 'Login successful.',
        token,
        user: {
          id: user.id,
          email: user.email,
          securitySetupCompleted: user.security_setup_completed,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async me(req, res, next) {
    try {
      const query = `
        SELECT u.id, u.email, u.security_setup_completed, u.created_at,
          EXISTS(SELECT 1 FROM face_templates WHERE user_id = u.id) as has_face_enrolled,
          EXISTS(SELECT 1 FROM webauthn_credentials WHERE user_id = u.id) as has_passkey_enrolled
        FROM users u
        WHERE u.id = $1
      `;
      const result = await db.query(query, [req.user.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const row = result.rows[0];
      res.json({
        user: {
          id: row.id,
          email: row.email,
          securitySetupCompleted: row.security_setup_completed,
          hasFaceEnrolled: row.has_face_enrolled,
          hasPasskeyEnrolled: row.has_passkey_enrolled,
          createdAt: row.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
