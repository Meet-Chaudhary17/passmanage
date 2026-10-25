-- PostgreSQL Schema for PassManage
-- Strict Zero-Dummy-Data: No pre-seeded rows

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types
DO $$ BEGIN
    CREATE TYPE credential_category AS ENUM ('SHAREABLE', 'RESTRICTED', 'HIGH_SENSITIVITY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE security_event_type AS ENUM (
        'LOGIN_SUCCESS',
        'LOGIN_FAILURE',
        'REGISTRATION_SUCCESS',
        'FACE_ENROLL_SUCCESS',
        'FACE_VERIFY_SUCCESS',
        'FACE_VERIFY_FAILURE',
        'PASSKEY_REGISTER_SUCCESS',
        'PASSKEY_AUTH_SUCCESS',
        'PASSKEY_AUTH_FAILURE',
        'CREDENTIAL_CREATED',
        'CREDENTIAL_UPDATED',
        'CREDENTIAL_DELETED',
        'CREDENTIAL_ACCESSED',
        'EXTENSION_LINKED',
        'EXTENSION_REVOKED',
        'SUSPICIOUS_ACCESS_DENIED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    security_setup_completed BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 1b. Pending Registrations (Email OTP Verification)
CREATE TABLE IF NOT EXISTS pending_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    otp_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Biometric Face Templates
CREATE TABLE IF NOT EXISTS face_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_name VARCHAR(50) DEFAULT 'ArcFace' NOT NULL,
    encrypted_embedding BYTEA NOT NULL,
    iv BYTEA NOT NULL,
    auth_tag BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. WebAuthn / Passkey Credentials
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    public_key BYTEA NOT NULL,
    counter BIGINT DEFAULT 0 NOT NULL,
    device_type VARCHAR(64),
    backed_up BOOLEAN DEFAULT FALSE,
    transports JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- 4. Vault Credentials (Single unified AES-256-GCM encrypted payload)
CREATE TABLE IF NOT EXISTS credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    website_name VARCHAR(128) NOT NULL,
    website_url TEXT NOT NULL,
    target_hostname VARCHAR(255) NOT NULL,
    match_subdomains BOOLEAN DEFAULT FALSE NOT NULL,
    category credential_category DEFAULT 'SHAREABLE' NOT NULL,
    encrypted_payload BYTEA NOT NULL,
    iv BYTEA NOT NULL,
    auth_tag BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credentials_user_hostname ON credentials(user_id, target_hostname);

-- 5. Extension Pairings & Challenges
CREATE TABLE IF NOT EXISTS extension_pairings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(128) NOT NULL,
    pairing_token_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS extension_pairing_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 6. Release Authorizations (Single-use 30s token storage)
CREATE TABLE IF NOT EXISTS release_authorizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
    auth_token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_release_auth_token ON release_authorizations(auth_token_hash);

-- 7. Verification Sessions (Bridge for Extension -> Localhost Verification Page)
CREATE TABLE IF NOT EXISTS verification_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
    category credential_category NOT NULL,
    status VARCHAR(32) DEFAULT 'PENDING' NOT NULL,
    face_verified BOOLEAN DEFAULT FALSE NOT NULL,
    passkey_verified BOOLEAN DEFAULT FALSE NOT NULL,
    release_token VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_lookup ON verification_sessions(id, status);

-- 8. Security Events (Append-only audit log)
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type security_event_type NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_time ON security_events(user_id, created_at DESC);
