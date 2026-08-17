CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Closed enums (these sets are stable)
CREATE TYPE currency_type AS ENUM ('virtual', 'real', 'bonus');
CREATE TYPE kyc_status    AS ENUM ('none', 'pending', 'verified', 'rejected');

-- provider + payment status are deliberately TEXT (not PG enums) so adding a
-- provider or status never requires ALTER TYPE.

-- ── Identity ──
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT UNIQUE NOT NULL,
    display_name TEXT,
    kyc_status kyc_status NOT NULL DEFAULT 'none',
    date_of_birth DATE,
    self_excluded_until TIMESTAMPTZ,
    daily_deposit_limit_minor BIGINT,
    daily_withdrawal_limit_minor BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone ON otp_codes (phone_number);

-- ── Wallet (folds old 001 + 009 is_frozen) ──
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency currency_type NOT NULL,
    balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, currency)
);
CREATE INDEX idx_wallets_user ON wallets (user_id);

CREATE TABLE wallet_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL, -- bet|win|deposit|manual_deposit|withdrawal|withdrawal_reversal
    amount_minor BIGINT NOT NULL,
    balance_after_minor BIGINT NOT NULL,
    reference_type TEXT,
    reference_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_ledger_wallet_time ON wallet_ledger (wallet_id, created_at DESC);

-- ── Game (folds old 002, 004, 005, 006) ──
CREATE TABLE game_rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency currency_type NOT NULL,
    total_stake_minor BIGINT NOT NULL,
    bets JSONB NOT NULL,
    result_position SMALLINT NOT NULL CHECK (result_position BETWEEN 1 AND 24),
    result_symbol TEXT NOT NULL,
    result_multiplier SMALLINT NOT NULL,
    gross_payout_minor BIGINT NOT NULL DEFAULT 0,
    net_result_minor BIGINT NOT NULL,
    is_win BOOLEAN NOT NULL,
    server_seed_hash TEXT NOT NULL,
    server_seed TEXT,
    client_seed TEXT NOT NULL,
    nonce BIGINT NOT NULL,
    paytable_version SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_nonce UNIQUE (user_id, nonce)
);
CREATE INDEX idx_game_rounds_user_time ON game_rounds (user_id, created_at DESC);
CREATE INDEX idx_game_rounds_nonce ON game_rounds (nonce);

CREATE TABLE server_seeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seed_hash TEXT NOT NULL,
    seed TEXT,
    nonce_start BIGINT NOT NULL,
    nonce_end BIGINT NOT NULL,
    is_revealed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_server_seeds_user ON server_seeds (user_id, is_revealed);

-- ═══════════════════════════════════════════════════════════
-- PAYMENTS (provider-agnostic)
-- ═══════════════════════════════════════════════════════════

-- Provider registry (replaces the PG enum). Adding a provider = INSERT a row
-- + register a Rust adapter. No ALTER TYPE. Seed only M-Pesa for now.
CREATE TABLE payment_providers (
    code TEXT PRIMARY KEY,                 -- 'mpesa', 'airtel_money', ...
    display_name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    supports_deposit BOOLEAN NOT NULL DEFAULT FALSE,
    supports_withdrawal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO payment_providers (code, display_name, enabled, supports_deposit, supports_withdrawal)
VALUES ('mpesa', 'M-Pesa', TRUE, TRUE, TRUE);

CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL REFERENCES payment_providers(code),
    direction TEXT NOT NULL CHECK (direction IN ('deposit', 'withdrawal')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','completed','failed','cancelled','reversed','expired')),
    currency CHAR(3) NOT NULL DEFAULT 'KES',          -- server-controlled invariant
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    phone_number TEXT NOT NULL,

    -- Client idempotency. request_fingerprint binds the key to THIS request's
    -- parameters so reusing a key with different params is rejected.
    client_idempotency_key TEXT,
    request_fingerprint TEXT,

    -- Provider-neutral identifiers (each adapter maps its own IDs here).
    provider_checkout_id     TEXT,
    provider_merchant_id     TEXT,
    provider_receipt         TEXT,
    provider_conversation_id TEXT,   -- gateway-minted payout idempotency key
    provider_reference       TEXT,

    result_code INT,
    result_desc TEXT,
    raw_callback JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_tx_user_status ON payment_transactions (user_id, status);

-- At most ONE in-flight withdrawal per user (DB-enforced race guard).
-- "In flight" = pending OR processing.
CREATE UNIQUE INDEX idx_one_inflight_withdrawal_per_user
    ON payment_transactions (user_id)
    WHERE direction = 'withdrawal' AND status IN ('pending', 'processing');

-- A provider receipt maps to exactly one deposit row (provider-scoped).
CREATE UNIQUE INDEX idx_payment_tx_receipt_unique
    ON payment_transactions (provider, provider_receipt)
    WHERE provider_receipt IS NOT NULL AND provider_receipt != '';

CREATE INDEX idx_payment_tx_checkout
    ON payment_transactions (provider, provider_checkout_id)
    WHERE provider_checkout_id IS NOT NULL;

CREATE INDEX idx_payment_tx_conversation
    ON payment_transactions (provider, provider_conversation_id)
    WHERE provider_conversation_id IS NOT NULL;

-- Client idempotency: one (user, key) pair. NULLs allowed to repeat.
CREATE UNIQUE INDEX idx_payment_tx_client_idempotency
    ON payment_transactions (user_id, client_idempotency_key)
    WHERE client_idempotency_key IS NOT NULL;

-- Webhook event log (external message history / replay / audit).
CREATE TABLE payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL REFERENCES payment_providers(code),
    payment_transaction_id UUID REFERENCES payment_transactions(id),
    webhook TEXT NOT NULL,
    external_event_id TEXT,
    event_type TEXT,
    payload JSONB NOT NULL,
    payload_hash TEXT,
    processing_status TEXT NOT NULL DEFAULT 'received'
        CHECK (processing_status IN ('received','processing','processed','failed','ignored')),
    processing_error TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);
CREATE INDEX idx_webhook_events_provider_status
    ON payment_webhook_events (provider, processing_status, received_at);
CREATE INDEX idx_webhook_events_payment ON payment_webhook_events (payment_transaction_id);
-- Provider-aware dedup aid (NOT unique — a provider may send multiple event
-- types for the same reference). Atomic settlement remains the authoritative
-- money idempotency mechanism, not this table.
CREATE INDEX idx_webhook_events_external
    ON payment_webhook_events (provider, external_event_id, webhook);

-- Quarantine for deposits that can't be matched to a user.
CREATE TABLE unmatched_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL REFERENCES payment_providers(code),
    provider_receipt TEXT NOT NULL,
    provider_reference TEXT,
    masked_msisdn TEXT,
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    amount_minor BIGINT NOT NULL,
    raw_callback JSONB,
    status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved','resolved')),
    resolved_user_id UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_receipt)
);
CREATE INDEX idx_unmatched_deposits_status ON unmatched_deposits (status, created_at);

-- M-Pesa-specific operational table (float monitoring). Deliberately
-- M-Pesa-shaped; lives in the M-Pesa adapter's operational area and does NOT
-- pollute the generic payment domain.
CREATE TABLE mpesa_balance_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    originator_conversation_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','success','failed','timeout')),
    working_account_minor BIGINT,
    utility_account_minor BIGINT,
    merchant_account_minor BIGINT,
    charges_paid_account_minor BIGINT,
    raw_callback JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mpesa_balance_queries_created ON mpesa_balance_queries (created_at DESC);
