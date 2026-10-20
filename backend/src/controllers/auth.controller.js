import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../config/database.js';
import { config } from '../config/env.js';
import { CryptoService } from '../services/crypto.service.js';
import { AuditService } from '../services/audit.service.js';

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

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
  }),
});

export class AuthController {
  static async register(req, res, next) {
    try {
      const { email, password } = req.validated.body;

      // 1. Check duplicate email
      const existingUser = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (existingUser.rowCount > 0) {
        return res.status(409).json({ error: 'An account with this email address already exists.' });
      }

      // 2. Hash password with Argon2id
      const passwordHash = await CryptoService.hashPassword(password);

      // 3. Create clean user record with ZERO dummy data
      const insertQuery = `
        INSERT INTO users (email, password_hash, security_setup_completed)
        VALUES (LOWER($1), $2, FALSE)
        RETURNING id, email, security_setup_completed, created_at
      `;
      const result = await db.query(insertQuery, [email, passwordHash]);
      const user = result.rows[0];

      // 4. Log real security event
      await AuditService.logEvent({
        userId: user.id,
        eventType: 'REGISTRATION_SUCCESS',
        req,
        details: { email: user.email },
      });

      // 5. Issue access token
      const token = jwt.sign(
        { userId: user.id, email: user.email, type: 'user' },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.status(201).json({
        message: 'Account registered successfully.',
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
