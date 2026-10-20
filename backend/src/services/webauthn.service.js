import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { config } from '../config/env.js';
import { db } from '../config/database.js';

// Ephemeral challenge cache with TTL
const challengeStore = new Map();

function setChallenge(key, challenge, ttlMs = 120000) {
  challengeStore.set(key, {
    challenge,
    expiresAt: Date.now() + ttlMs,
  });
}

function getAndClearChallenge(key) {
  const entry = challengeStore.get(key);
  if (!entry) return null;
  challengeStore.delete(key);
  if (Date.now() > entry.expiresAt) return null;
  return entry.challenge;
}

export class WebAuthnService {
  /**
   * Generate registration options for new Passkey
   */
  static async getRegistrationOptions(user) {
    // Check existing registered credentials to exclude
    const existingCredsRes = await db.query(
      'SELECT credential_id FROM webauthn_credentials WHERE user_id = $1',
      [user.id]
    );
    const excludeCredentials = existingCredsRes.rows.map((row) => ({
      id: row.credential_id,
      transports: ['internal', 'hybrid'],
    }));

    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpId,
      userID: Buffer.from(user.id, 'utf8'),
      userName: user.email,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    setChallenge(`reg:${user.id}`, options.challenge);
    return options;
  }

  /**
   * Verify registration response from client and persist credential
   */
  static async verifyRegistration(userId, response) {
    const expectedChallenge = getAndClearChallenge(`reg:${userId}`);
    if (!expectedChallenge) {
      throw new Error('Registration challenge expired or missing. Please try again.');
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('WebAuthn registration verification failed');
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Persist in PostgreSQL
    const query = `
      INSERT INTO webauthn_credentials (
        user_id, credential_id, public_key, counter, device_type, backed_up, transports
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, credential_id, created_at
    `;
    const values = [
      userId,
      credential.id,
      Buffer.from(credential.publicKey),
      credential.counter,
      credentialDeviceType,
      credentialBackedUp,
      JSON.stringify(response.response.transports || ['internal']),
    ];

    const res = await db.query(query, values);
    return res.rows[0];
  }

  /**
   * Generate authentication options for enrolled passkeys
   */
  static async getAuthenticationOptions(userId) {
    const credsRes = await db.query(
      'SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1',
      [userId]
    );

    if (credsRes.rowCount === 0) {
      throw new Error('No registered passkeys found for user');
    }

    const allowCredentials = credsRes.rows.map((row) => ({
      id: row.credential_id,
      transports: row.transports || ['internal'],
    }));

    const options = await generateAuthenticationOptions({
      rpID: config.rpId,
      allowCredentials,
      userVerification: 'preferred',
    });

    setChallenge(`auth:${userId}`, options.challenge);
    return options;
  }

  /**
   * Verify authentication assertion
   */
  static async verifyAuthentication(userId, response) {
    const expectedChallenge = getAndClearChallenge(`auth:${userId}`);
    if (!expectedChallenge) {
      throw new Error('Authentication challenge expired or missing. Please try again.');
    }

    const credentialRes = await db.query(
      'SELECT * FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2',
      [userId, response.id]
    );

    if (credentialRes.rowCount === 0) {
      throw new Error('WebAuthn credential not recognized for this user');
    }

    const credentialRecord = credentialRes.rows[0];

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      credential: {
        id: credentialRecord.credential_id,
        publicKey: new Uint8Array(credentialRecord.public_key),
        counter: Number(credentialRecord.counter),
        transports: credentialRecord.transports || ['internal'],
      },
    });

    if (!verification.verified) {
      throw new Error('Passkey signature verification failed');
    }

    // Update counter to prevent replay
    await db.query(
      'UPDATE webauthn_credentials SET counter = $1, last_used_at = NOW() WHERE id = $2',
      [verification.authenticationInfo.newCounter, credentialRecord.id]
    );

    return true;
  }
}
