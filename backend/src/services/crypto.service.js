import crypto from 'crypto';
import argon2 from 'argon2';
import { config } from '../config/env.js';

export class CryptoService {
  /**
   * One-way password hash using Argon2id
   */
  static async hashPassword(password) {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Verify password against Argon2id hash
   */
  static async verifyPassword(hash, password) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Derive a unique 256-bit User Vault Key (UVK) using HKDF-SHA256
   */
  static deriveUserKey(userId) {
    const masterKey = Buffer.from(config.vaultMasterKey, 'hex');
    const salt = Buffer.from(userId, 'utf8');
    const info = Buffer.from('passmanage-vault-v2', 'utf8');
    return crypto.hkdfSync('sha256', masterKey, salt, info, 32);
  }

  /**
   * Unified Single-Payload Credential Encryption (AES-256-GCM)
   * Encrypts { username, password, notes } with exactly one 12-byte IV and 16-byte tag.
   */
  static encryptCredentialPayload(userId, credentialId, payloadObj) {
    const uvk = this.deriveUserKey(userId);
    const iv = crypto.randomBytes(12); // 96-bit nonce
    const cipher = crypto.createCipheriv('aes-256-gcm', uvk, iv);

    // Bind AAD to prevent record transposition attacks
    const aad = Buffer.from(`${userId}:${credentialId}`, 'utf8');
    cipher.setAAD(aad);

    const plaintext = JSON.stringify(payloadObj);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      encryptedPayload: encrypted,
      iv,
      authTag,
    };
  }

  /**
   * Decrypt single payload
   */
  static decryptCredentialPayload(userId, credentialId, encryptedPayload, iv, authTag) {
    const uvk = this.deriveUserKey(userId);
    const decipher = crypto.createDecipheriv('aes-256-gcm', uvk, iv);

    const aad = Buffer.from(`${userId}:${credentialId}`, 'utf8');
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedPayload), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  /**
   * Derive Biometric Key
   */
  static deriveBiometricKey(userId) {
    const bioMasterKey = Buffer.from(config.biometricEncryptionKey, 'hex');
    const salt = Buffer.from(userId, 'utf8');
    const info = Buffer.from('passmanage-biometric-v1', 'utf8');
    return crypto.hkdfSync('sha256', bioMasterKey, salt, info, 32);
  }

  /**
   * Encrypt 512-d float embedding vector
   */
  static encryptBiometricEmbedding(userId, embeddingArray) {
    const key = this.deriveBiometricKey(userId);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const aad = Buffer.from(`biometric:${userId}`, 'utf8');
    cipher.setAAD(aad);

    const plaintext = JSON.stringify(embeddingArray);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      encryptedEmbedding: encrypted,
      iv,
      authTag,
    };
  }

  /**
   * Decrypt 512-d float embedding vector
   */
  static decryptBiometricEmbedding(userId, encryptedEmbedding, iv, authTag) {
    const key = this.deriveBiometricKey(userId);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

    const aad = Buffer.from(`biometric:${userId}`, 'utf8');
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedEmbedding), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  /**
   * Cryptographically secure random token (hex)
   */
  static generateToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * SHA-256 hash helper (for pairing codes and release tokens in DB)
   */
  static hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
