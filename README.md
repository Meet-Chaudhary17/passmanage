# PassManage — Security-Focused Password Manager & Chrome Extension

A complete, production-grade, locally runnable academic prototype password manager featuring:
- **React.js + Tailwind CSS** enterprise dark web client
- **Node.js + Express.js** REST API backend
- **PostgreSQL** normalized relational database
- **Python + DeepFace (ArcFace)** isolated biometric face verification microservice
- **FIDO2 / WebAuthn** hardware passkeys (`@simplewebauthn` v14)
- **Manifest V3 Chrome Extension** companion with login form detection and origin-isolated autofill
- **AES-256-GCM** single-payload authenticated encryption with HKDF key derivation
- **Progressive Authentication**: Shareable (Session) $\rightarrow$ Restricted (Biometric Face) $\rightarrow$ High Sensitivity (Face + Passkey)
- **Strict Zero-Dummy-Data Guarantee**: All new accounts start completely empty with 0 credentials.

---

## 1. System Architecture Overview

```
[React Web App :5173] <---> [Express API Gateway :5000] <---> [PostgreSQL :5432]
         ^                               ^
         |                               | (Shared Secret Header)
         v                               v
[Chrome Extension (MV3)]     [Python Face Service :8000] (ArcFace)
```

- **Master Passwords**: One-way hashed with **Argon2id** (64MB memory cost, 3 iterations).
- **Vault Secrets**: Unified single-payload authenticated encryption (**AES-256-GCM**) with unique 12-byte IV and 16-byte auth tag per record.
- **Biometric Templates**: 512-dimensional ArcFace vectors encrypted at rest with AES-256-GCM. Raw camera photographs are processed strictly in RAM and discarded immediately (zero disk writes).
- **Single-Use Release Tokens**: When progressive authentication succeeds, a 256-bit token is saved in PostgreSQL with a 30-second TTL. The token is immediately consumed upon releasing decrypted credentials.

---

## 2. Prerequisites

- **Node.js**: v20+ or v22+ (`node -v`, `npm -v`)
- **Python**: 3.10 – 3.12 (`python --version`)
- **PostgreSQL**: 16+ running on `localhost:5432` (WSL, Docker, or Windows Native)
- **Google Chrome**: Modern browser supporting WebAuthn and Manifest V3 extensions

---

## 3. Quick Start Guide (Windows Commands)

### Step 1: Start PostgreSQL & Setup Database
Ensure PostgreSQL is active on port 5432 and user `postgres` has password `postgres`:
```powershell
# If using WSL Ubuntu (as in this environment):
wsl -d Ubuntu -u root -- service postgresql start

# Create database 'passmanage' (if not already created):
# 'CREATE DATABASE passmanage;' | wsl -d Ubuntu -u root -- su - postgres -c psql
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `backend\.env` and `face-service\.env`:
```powershell
Copy-Item .env.example backend\.env
```

Generate cryptographically secure 32-byte hex keys:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
*(Pre-configured local keys are already populated in `backend\.env` and `face-service\.env` for instant local execution).*

### Step 3: Run Database Migrations
Applies the normalized schema (`users`, `face_templates`, `webauthn_credentials`, `credentials`, `extension_pairings`, `release_authorizations`, `verification_sessions`, `security_events`):
```powershell
cd backend
node src/db/migrate.js
cd ..
```

### Step 4: Start Python Biometric Microservice (Port 8000)
```powershell
# Open Terminal 1:
cd face-service
.\venv\Scripts\python.exe main.py
```
*The service starts on `http://127.0.0.1:8000`. It asynchronously preloads the ArcFace model. You can verify its status at `http://127.0.0.1:8000/health`.*

### Step 5: Start Express Backend API (Port 5000)
```powershell
# Open Terminal 2:
cd backend
npm run dev
```
*API runs on `http://localhost:5000`. Health check: `http://localhost:5000/api/health`.*

### Step 6: Start React Web Frontend (Port 5173)
```powershell
# Open Terminal 3:
cd frontend
npm run dev
```
*Open your browser to `http://localhost:5173`.*

### Step 7: Load Chrome Companion Extension (Manifest V3)
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle the **"Developer mode"** switch in the top-right corner.
3. Click the **"Load unpacked"** button.
4. Select the directory:
   ```
   c:\24BBS0147\passmanage\chrome-extension
   ```
5. Pin the **PassManage Companion** extension to your Chrome toolbar.

---

## 4. End-to-End Demonstration Walkthrough

Follow this exact test flow to verify all features and security tiers:

### 1. Register a Completely New User
1. Navigate to `http://localhost:5173/register`.
2. Create an account with a strong password (e.g. `MasterPassword#2026`).
3. Confirm you are redirected to `/onboarding`.

### 2. Complete First-Time Security Setup
1. **Face Enrollment**:
   - Click "Enable Camera".
   - Center your face in the oval alignment guide.
   - Click "Capture & Enroll Face".
   - The Python microservice generates a 512-d ArcFace vector, and the backend stores the AES-256-GCM encrypted biometric template.
2. **Passkey Registration**:
   - Click "Register Hardware Passkey".
   - Complete your browser's native platform authenticator ceremony (Windows Hello, Touch ID, or security key).
   - Public key and signature counter are saved in PostgreSQL.
3. Click "Enter Empty Vault".

### 3. Verify Strict Empty Vault State
- The vault opens with **zero credentials**.
- Displays the empty state: *"Your vault is empty. Add your first credential to get started."*
- Zero dummy data or mock users are present.

### 4. Pair the Chrome Browser Extension
1. On the web dashboard, click the floating **"Add Extension"** button (bottom-right) or "Extension" in the navbar.
2. Click **"Generate 5-Minute Pairing Code"** (e.g. `PM-7241-AB`).
3. Click the PassManage extension icon in your Chrome toolbar.
4. Paste the 8-character code into the popup and click **"Link Extension"**.
5. The extension status updates to **"Connected"** with your user email.

### 5. Create Test Credentials Across the 3 Security Tiers
Click **"+ Add Credential"** in the web vault and create three distinct records:
1. **Tier 1 (Shareable)**:
   - Website Name: `GitHub Work`
   - Website URL: `https://github.com/login`
   - Username: `github_dev`
   - Password: `SecretPassword_Shareable_123!`
   - Security Category: **Shareable**
2. **Tier 2 (Restricted)**:
   - Website Name: `AWS Management`
   - Website URL: `https://console.aws.amazon.com`
   - Username: `aws_admin`
   - Password: `SecretPassword_Restricted_456!`
   - Security Category: **Restricted**
3. **Tier 3 (High Sensitivity)**:
   - Website Name: `Corporate Banking`
   - Website URL: `https://secure.bank.com/login`
   - Username: `bank_officer`
   - Password: `SecretPassword_Sensitive_789!`
   - Security Category: **High Sensitivity**

### 6. Test Tier 1: Shareable Access
- In the vault, click **"Access / Reveal"** on GitHub Work.
- Because it is Shareable, access is authorized by your active session.
- A single-use release token is generated, the payload is decrypted, and the password is displayed with a Copy button.

### 7. Test Tier 2: Restricted Face Verification
- Click **"Access / Reveal"** on AWS Management.
- System prompts: *"Step: Biometric Face Verification"*.
- The camera opens $\rightarrow$ align your face $\rightarrow$ click **"Verify Facial Biometrics"**.
- The live frame is compared against your enrolled embedding ($\le 0.68$ cosine distance).
- Upon success, the credential is decrypted and displayed.

### 8. Test Tier 3: High Sensitivity Face + Passkey
- Click **"Access / Reveal"** on Corporate Banking.
- **Step 1**: System prompts for Biometric Face Verification $\rightarrow$ Scan face $\rightarrow$ Verified.
- **Step 2**: System automatically advances to Passkey verification $\rightarrow$ Click "Verify Hardware Passkey" $\rightarrow$ complete Windows Hello / Touch ID prompt.
- Only after BOTH factors succeed is the release token granted and the credential decrypted.

### 9. Test Deliberate Security Failures (Negative Testing)
- **Cover Camera / Wrong Face**: Attempt Restricted access while blocking the camera $\rightarrow$ *"NO_FACE_DETECTED"* or *"Face verification failed"* $\rightarrow$ Zero credential release.
- **Cancel Passkey**: In High Sensitivity, cancel the WebAuthn prompt $\rightarrow$ *"Passkey ceremony failed or cancelled"* $\rightarrow$ Zero credential release.
- **Token Replay Defense**: Release tokens expire in 30 seconds and are single-use. Re-submitting an already used release token returns `403 Forbidden`.
- **Phishing Prevention**: Open an unrelated or deceptive domain (e.g. `https://attacker-github.com`) $\rightarrow$ Extension reports 0 matching credentials, refusing to expose credentials.

### 10. Inspect the Security Audit Activity
- Click **"Security Activity"** in the top navigation bar.
- View real audit log entries for every action performed: `REGISTRATION_SUCCESS`, `CREDENTIAL_CREATED`, `FACE_VERIFY_SUCCESS`, `PASSKEY_AUTH_SUCCESS`, `CREDENTIAL_ACCESSED`, `EXTENSION_LINKED`.

---

## 5. Security & Verification Engine Reference

| Parameter | Configuration | Notes |
| :--- | :--- | :--- |
| **Password Hasher** | Argon2id | Memory: 64MB, Iterations: 3, Parallelism: 4 |
| **Vault Encryption** | AES-256-GCM | 12-byte IV, 16-byte Auth Tag, Single JSON Payload |
| **Key Derivation** | HKDF-SHA256 | Derived per-user from server `VAULT_MASTER_KEY` |
| **Biometric Model** | ArcFace | 512-dimensional normalized float embedding |
| **Biometric Metric** | Cosine Distance | Configurable prototype threshold: `≤ 0.68` |
| **Passkey Standard** | FIDO2 / WebAuthn | Standard `@simplewebauthn` v14 server/browser |
| **Extension Auth** | Dedicated JWT | Rotatable `extension_token` stored in `chrome.storage.local` |
| **Audit Log** | Append-Only | Genuine client IP and User-Agent tracking |

---

## 6. Running Automated Tests

```powershell
# Run backend test suite (12 tests covering Crypto, URL Matching, Auth, and E2E Progressive Flow):
cd backend
npm test

# Run Python Face Service test suite (pytest):
cd face-service
.\venv\Scripts\pytest.exe tests/
```
