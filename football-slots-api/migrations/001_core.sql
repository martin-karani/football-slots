-- Migration 001: Core tables (users, wallets, wallet_ledger)
-- Run with: sqlx migrate add <name> then sqlx migrate run

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Currency types: virtual (free play), real (M-Pesa funded), bonus (promotional)
CREATE TYPE currency_type AS ENUM ('virtual', 'real', 'bonus');

-- KYC verification status for real-money gating
CREATE TYPE kyc_status AS ENUM ('none', 'pending', 'verified', 'rejected');

-- Users are identified by phone number (OTP login) since that's also the
-- M-Pesa identity. No password column: this is a passwordless, phone-first
-- product, matching how Betika/M-Pesa users already expect to log in.
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT UNIQUE NOT NULL,
    display_name TEXT,
    kyc_status kyc_status NOT NULL DEFAULT 'none',
    date_of_birth DATE,
    self_excluded_until TIMESTAMPTZ,
    daily_deposit_limit_minor BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (user, currency). Balances never move between currencies
-- directly -- only via explicit, audited ledger entries.
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency currency_type NOT NULL,
    balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, currency)
);
CREATE INDEX idx_wallets_user ON wallets (user_id);

-- Append-only ledger. Every balance change is a row here first;
-- wallets.balance_minor is a cached projection kept in sync inside
-- the same DB transaction.
-- amount_minor is signed: positive = credit, negative = debit.
CREATE TABLE wallet_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL, -- 'bet' | 'win' | 'deposit' | 'withdrawal' | 'bonus_credit' | 'gamble'
    amount_minor BIGINT NOT NULL,
    balance_after_minor BIGINT NOT NULL,
    reference_type TEXT,      -- 'game_round' | 'gamble_round' | 'mpesa_transaction'
    reference_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_ledger_wallet_time ON wallet_ledger (wallet_id, created_at DESC);

-- OTP codes for phone verification (ephemeral)
CREATE TABLE otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone ON otp_codes (phone_number);

-- Server seeds for provably fair RNG
-- Each user gets a rotating pool of pre-hashed server seeds.
-- The hash is revealed BEFORE the spin; the seed is revealed AFTER.
CREATE TABLE server_seeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seed_hash TEXT NOT NULL,          -- SHA256 of the actual seed
    seed TEXT,                        -- NULL until revealed after use
    nonce_start BIGINT NOT NULL,      -- first nonce this seed is valid for
    nonce_end BIGINT NOT NULL,        -- last nonce (inclusive)
    is_revealed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_server_seeds_user ON server_seeds (user_id, is_revealed);
