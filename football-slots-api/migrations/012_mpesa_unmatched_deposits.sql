-- Migration 012: Quarantine for C2B deposits that couldn't be matched to a user
--
-- When a customer manually pays the Paybill, the BillRefNumber they enter is
-- the only reliable identifier (C2B v2 confirmation payloads contain a masked
-- MSISDN). If that reference doesn't resolve to a known user account, the
-- payment is quarantined here instead of being silently dropped.
--
-- An admin can later resolve these by matching the receipt number or amount
-- to a user and crediting the wallet manually.

CREATE TABLE IF NOT EXISTS mpesa_unmatched_c2b_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mpesa_receipt_number TEXT UNIQUE NOT NULL,
    bill_ref_number TEXT,
    masked_msisdn TEXT,
    amount_minor BIGINT NOT NULL,
    raw_callback JSONB,
    status TEXT NOT NULL DEFAULT 'unresolved'
        CHECK (status IN ('unresolved', 'resolved')),
    resolved_user_id UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_unmatched_c2b_deposits_status
    ON mpesa_unmatched_c2b_deposits (status, created_at);
