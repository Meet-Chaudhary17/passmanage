import test from 'node:test';
import assert from 'node:assert/strict';
import { EmailService } from '../src/services/email.service.js';

test('EmailService - sendRegistrationOtp sends verification email', async () => {
  const testOtp = '849201';
  try {
    const info = await EmailService.sendRegistrationOtp('passmanagexyz@gmail.com', testOtp);
    assert.ok(info.messageId, 'Email messageId should be returned');
    assert.ok(info.accepted.includes('passmanagexyz@gmail.com'), 'Email should be accepted by recipient');
  } catch (err) {
    if (err.code === 'EDNS' || err.message.includes('DNS lookup')) {
      console.log('Skipping live SMTP delivery in offline test environment.');
      return;
    }
    throw err;
  }
});

test('EmailService - sendIntruderAlert sends alert with cropped photo attachment', async () => {
  // Minimal valid 1x1 JPEG base64
  const sampleJpegBase64 =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  try {
    const info = await EmailService.sendIntruderAlert({
      to: 'passmanagexyz@gmail.com',
      websiteName: 'Google Workspace',
      targetHostname: 'accounts.google.com',
      ipAddress: '192.168.1.45',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
      timestamp: new Date(),
      intruderImageBase64: sampleJpegBase64,
    });

    assert.ok(info.messageId, 'Intruder alert messageId should be returned');
    assert.ok(info.accepted.includes('passmanagexyz@gmail.com'), 'Intruder alert email should be delivered');
  } catch (err) {
    if (err.code === 'EDNS' || err.message.includes('DNS lookup')) {
      console.log('Skipping live SMTP delivery in offline test environment.');
      return;
    }
    throw err;
  }
});
