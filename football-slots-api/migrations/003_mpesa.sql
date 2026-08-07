-- Migration 003: M-Pesa transaction tracking

-- Mirrors the Daraja STK Push lifecycle. checkout_request_id is the
-- idempotency key: Safaricom can retry callbacks, so the callback handler
-- upserts on this column rather than assuming at-most-once delivery.
CREATE TABLE mpesa_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('deposit', 'withdrawal')),
    checkout_request_id TEXT UNIQUE,
    merchant_request_id TEXT,
    amount_minor BIGINT NOT NULL,
    phone_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    mpesa_receipt_number TEXT,
    result_code INT,
    result_desc TEXT,
    raw_callback JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mpesa_tx_user_status ON mpesa_transactions (user_id, status);
CREATE INDEX idx_mpesa_tx_checkout ON mpesa_transactions (checkout_request_id);
