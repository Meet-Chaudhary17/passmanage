import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { db } from '../config/database.js';

/**
 * Standard user authentication middleware for Web Application
 */
export async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Missing or malformed token.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      }
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }

    const query = 'SELECT id, email, security_setup_completed FROM users WHERE id = $1';
    const userRes = await db.query(query, [decoded.userId]);

    if (userRes.rowCount === 0) {
      return res.status(401).json({ error: 'User account no longer exists.' });
    }

    req.user = userRes.rows[0];
    req.authType = 'user';
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Separate dedicated extension authentication middleware
 * Uses dedicated EXTENSION_JWT_SECRET and checks extension_pairings table
 */
export async function authenticateExtension(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Extension authentication required. Missing token.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, config.extensionJwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Extension session expired. Please re-pair or refresh.' });
      }
      return res.status(401).json({ error: 'Invalid extension token.' });
    }

    if (decoded.type !== 'extension' || !decoded.pairingId) {
      return res.status(401).json({ error: 'Malformed extension token.' });
    }

    // Verify pairing is active in PostgreSQL
    const pairQuery = `
      SELECT p.id as pairing_id, p.is_active, u.id as user_id, u.email, u.security_setup_completed
      FROM extension_pairings p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1 AND p.user_id = $2
    `;
    const pairRes = await db.query(pairQuery, [decoded.pairingId, decoded.userId]);

    if (pairRes.rowCount === 0 || !pairRes.rows[0].is_active) {
      return res.status(401).json({ error: 'Extension pairing has been revoked or is invalid.' });
    }

    // Update last_accessed_at
    db.query('UPDATE extension_pairings SET last_accessed_at = NOW() WHERE id = $1', [decoded.pairingId]).catch(
      (e) => console.error('[PAIRING] Failed to update access time:', e)
    );

    req.user = {
      id: pairRes.rows[0].user_id,
      email: pairRes.rows[0].email,
      securitySetupCompleted: pairRes.rows[0].security_setup_completed,
    };
    req.pairing = { id: pairRes.rows[0].pairing_id };
    req.authType = 'extension';
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Flexible middleware: Accepts either web user JWT or extension JWT
 */
export async function authenticateFlexible(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];

  // First try user JWT
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const userRes = await db.query('SELECT id, email, security_setup_completed FROM users WHERE id = $1', [
      decoded.userId,
    ]);
    if (userRes.rowCount > 0) {
      req.user = userRes.rows[0];
      req.authType = 'user';
      return next();
    }
  } catch {
    // try extension JWT
  }

  // Then try extension JWT
  return authenticateExtension(req, res, next);
}
