import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { db, pool } from '../src/config/database.js';

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

test('End-to-End Progressive Auth & Zero Dummy Data Verification', async () => {
  const testEmail = `integration_test_${Date.now()}@example.com`;
  const testPassword = 'CorrectHorseBattery#2026';

  // 1. Initiate registration with Email OTP
  const regReq = await fetch(`${baseUrl}/api/auth/register-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      confirmPassword: testPassword,
    }),
  });

  assert.equal(regReq.status, 200, 'OTP request should succeed');
  const reqData = await regReq.json();
  assert.equal(reqData.success, true);

  // Retrieve generated OTP from pending_registrations
  const pendingRes = await db.query(
    'SELECT otp_code FROM pending_registrations WHERE LOWER(email) = LOWER($1)',
    [testEmail]
  );
  assert.equal(pendingRes.rowCount, 1, 'Pending registration should exist in DB');
  const otpCode = pendingRes.rows[0].otp_code;

  // Verify OTP and complete registration
  const regRes = await fetch(`${baseUrl}/api/auth/register-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      otp: otpCode,
    }),
  });

  assert.equal(regRes.status, 201, 'Registration verification should succeed');
  const regData = await regRes.json();
  const token = regData.token;
  const userId = regData.user.id;
  assert.ok(token, 'JWT token should be returned');
  assert.equal(regData.user.securitySetupCompleted, false);

  try {
    // 2. Verify account starts with ZERO credentials (Strict Zero Dummy Data)
    const vaultRes = await fetch(`${baseUrl}/api/vault`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(vaultRes.status, 200);
    const vaultData = await vaultRes.json();
    assert.equal(vaultData.credentials.length, 0, 'New vault must start with exactly 0 credentials');

    // 3. Add a SHAREABLE credential
    const createRes = await fetch(`${baseUrl}/api/vault`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        websiteName: 'GitHub Inc',
        websiteUrl: 'https://github.com/login',
        username: 'dev_user',
        password: 'vault_super_secret_pw',
        category: 'SHAREABLE',
        matchSubdomains: false,
      }),
    });

    assert.equal(createRes.status, 201);
    const createdCred = (await createRes.json()).credential;
    assert.equal(createdCred.target_hostname, 'github.com');
    assert.equal(createdCred.category, 'SHAREABLE');

    // 4. Verify list endpoint returns metadata only (no passwords or usernames leaked)
    const listRes = await fetch(`${baseUrl}/api/vault`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json();
    assert.equal(listData.credentials.length, 1);
    const listed = listData.credentials[0];
    assert.equal(listed.password, undefined, 'Plaintext password must NOT be in vault list');
    assert.equal(listed.encrypted_payload, undefined, 'Raw encrypted payload must NOT be in vault list');

    // 5. Initiate access for SHAREABLE
    const initRes = await fetch(`${baseUrl}/api/vault/${createdCred.id}/initiate-access`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(initRes.status, 200);
    const initData = await initRes.json();
    assert.equal(initData.authorized, true);
    assert.ok(initData.releaseToken, 'Release token should be granted for shareable credential');

    // 6. Release credential using release token
    const releaseRes = await fetch(`${baseUrl}/api/vault/${createdCred.id}/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ releaseToken: initData.releaseToken }),
    });
    assert.equal(releaseRes.status, 200);
    const releaseData = await releaseRes.json();
    assert.equal(releaseData.username, 'dev_user');
    assert.equal(releaseData.password, 'vault_super_secret_pw');

    // 7. Single-use replay prevention test: using releaseToken a second time MUST fail
    const replayRes = await fetch(`${baseUrl}/api/vault/${createdCred.id}/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ releaseToken: initData.releaseToken }),
    });
    assert.equal(replayRes.status, 403, 'Replayed single-use release token must be rejected with 403');

    // 8. Add RESTRICTED credential
    const createRestrictedRes = await fetch(`${baseUrl}/api/vault`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        websiteName: 'AWS Console',
        websiteUrl: 'https://console.aws.amazon.com',
        username: 'admin_aws',
        password: 'aws_master_password_999',
        category: 'RESTRICTED',
      }),
    });
    const restrictedCred = (await createRestrictedRes.json()).credential;

    // 9. Initiate access for RESTRICTED requires face
    const initRestricted = await fetch(`${baseUrl}/api/vault/${restrictedCred.id}/initiate-access`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const initRestrictedData = await initRestricted.json();
    assert.equal(initRestrictedData.authorized, false);
    assert.equal(initRestrictedData.requiredStep, 'FACE');

    // 10. Attempting release without completing face verification fails
    const unauthorizedRel = await fetch(`${baseUrl}/api/vault/${restrictedCred.id}/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ releaseToken: 'invalid_forged_token' }),
    });
    assert.equal(unauthorizedRel.status, 403);

    // 11. Extension Pairing Challenge Flow
    const challengeRes = await fetch(`${baseUrl}/api/extension/challenge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const challengeData = await challengeRes.json();
    assert.ok(challengeData.pairingCode);

    // Exchange challenge code
    const pairRes = await fetch(`${baseUrl}/api/extension/pair-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: challengeData.pairingCode, deviceName: 'Test Extension' }),
    });
    assert.equal(pairRes.status, 200);
    const pairData = await pairRes.json();
    const extToken = pairData.extensionToken;
    assert.ok(extToken);

    // Replay challenge code must fail (Single-use)
    const replayPair = await fetch(`${baseUrl}/api/extension/pair-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: challengeData.pairingCode }),
    });
    assert.equal(replayPair.status, 400);

    // 12. Extension queries matching credentials
    const queryMatch = await fetch(
      `${baseUrl}/api/extension/query-credentials?url=https://github.com/login`,
      {
        headers: { Authorization: `Bearer ${extToken}` },
      }
    );
    const queryMatchData = await queryMatch.json();
    assert.equal(queryMatchData.matches.length, 1);
    assert.equal(queryMatchData.matches[0].websiteName, 'GitHub Inc');
    // Ensure zero username or password leak in query
    assert.equal(queryMatchData.matches[0].username, undefined);
    assert.equal(queryMatchData.matches[0].password, undefined);

    // Unmatched website returns 0
    const queryUnmatched = await fetch(
      `${baseUrl}/api/extension/query-credentials?url=https://attacker.com/login`,
      {
        headers: { Authorization: `Bearer ${extToken}` },
      }
    );
    const queryUnmatchedData = await queryUnmatched.json();
    assert.equal(queryUnmatchedData.matches.length, 0);

    // 13. Verify Audit Log recorded real events
    const auditRes = await fetch(`${baseUrl}/api/audit/events`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const auditData = await auditRes.json();
    assert.ok(auditData.events.length >= 3, 'Real security events should be recorded');
    const eventTypes = auditData.events.map((e) => e.event_type);
    assert.ok(eventTypes.includes('REGISTRATION_SUCCESS'));
    assert.ok(eventTypes.includes('CREDENTIAL_CREATED'));
    assert.ok(eventTypes.includes('CREDENTIAL_ACCESSED'));
    assert.ok(eventTypes.includes('EXTENSION_LINKED'));
  } finally {
    // Clean up test user so the database remains clean
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
  }
});
