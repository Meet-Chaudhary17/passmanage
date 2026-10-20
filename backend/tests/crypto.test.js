import test from 'node:test';
import assert from 'node:assert/strict';
import { CryptoService } from '../src/services/crypto.service.js';

test('CryptoService - Argon2id hashing and verification', async () => {
  const password = 'CorrectHorseBatteryStaple#2026';
  const hash = await CryptoService.hashPassword(password);

  assert.ok(hash.startsWith('$argon2id$'), 'Hash should be Argon2id');
  assert.equal(await CryptoService.verifyPassword(hash, password), true);
  assert.equal(await CryptoService.verifyPassword(hash, 'WrongPassword'), false);
});

test('CryptoService - Single-payload AES-256-GCM encryption & decryption', () => {
  const userId = '11111111-2222-3333-4444-555555555555';
  const credentialId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const payload = {
    username: 'developer@example.com',
    password: 'super_secret_vault_password_xyz',
    notes: 'Important production credential',
  };

  const { encryptedPayload, iv, authTag } = CryptoService.encryptCredentialPayload(
    userId,
    credentialId,
    payload
  );

  assert.equal(iv.length, 12, 'IV should be 12 bytes');
  assert.equal(authTag.length, 16, 'AuthTag should be 16 bytes');

  const decrypted = CryptoService.decryptCredentialPayload(
    userId,
    credentialId,
    encryptedPayload,
    iv,
    authTag
  );

  assert.deepEqual(decrypted, payload, 'Decrypted payload should match original');
});

test('CryptoService - Tamper detection (Modified auth tag throws)', () => {
  const userId = '11111111-2222-3333-4444-555555555555';
  const credentialId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const payload = { username: 'dev', password: 'pass', notes: '' };

  const { encryptedPayload, iv, authTag } = CryptoService.encryptCredentialPayload(
    userId,
    credentialId,
    payload
  );

  // Corrupt 1 byte of authTag
  const corruptedTag = Buffer.from(authTag);
  corruptedTag[0] ^= 0xff;

  assert.throws(() => {
    CryptoService.decryptCredentialPayload(userId, credentialId, encryptedPayload, iv, corruptedTag);
  }, /Unsupported state or unable to authenticate data/);
});

test('CryptoService - Biometric embedding vector encryption & decryption', () => {
  const userId = '11111111-2222-3333-4444-555555555555';
  const embedding = Array.from({ length: 512 }, (_, i) => Math.sin(i));

  const { encryptedEmbedding, iv, authTag } = CryptoService.encryptBiometricEmbedding(
    userId,
    embedding
  );

  const decrypted = CryptoService.decryptBiometricEmbedding(
    userId,
    encryptedEmbedding,
    iv,
    authTag
  );

  assert.equal(decrypted.length, 512);
  assert.ok(Math.abs(decrypted[0] - embedding[0]) < 1e-6);
});
