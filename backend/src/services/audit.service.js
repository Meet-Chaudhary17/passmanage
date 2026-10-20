import { db } from '../config/database.js';

export class AuditService {
  /**
   * Extract genuine client IP and user agent without trusting arbitrary spoofed headers
   */
  static extractClientMeta(req) {
    if (!req) {
      return { ipAddress: '127.0.0.1', userAgent: 'System Internal' };
    }
    const ipAddress = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req.headers ? (req.headers['user-agent'] || 'Unknown Agent') : 'Unknown Agent';
    return { ipAddress, userAgent };
  }

  /**
   * Append-only security event logger.
   * Never mutates or deletes existing audit events.
   */
  static async logEvent({ userId, eventType, req, details = {} }) {
    try {
      const { ipAddress, userAgent } = this.extractClientMeta(req);
      const query = `
        INSERT INTO security_events (user_id, event_type, ip_address, user_agent, details)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at
      `;
      const values = [userId, eventType, ipAddress, userAgent, JSON.stringify(details)];
      const res = await db.query(query, values);
      return res.rows[0];
    } catch (error) {
      console.error('[AUDIT] Failed to record security event:', error);
      // Non-blocking for caller, but logged to server console
    }
  }

  /**
   * Retrieve genuine audit trail for authenticated user
   */
  static async getUserEvents(userId, limit = 50, offset = 0) {
    const query = `
      SELECT id, event_type, ip_address, user_agent, details, created_at
      FROM security_events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const res = await db.query(query, [userId, limit, offset]);
    return res.rows;
  }
}
