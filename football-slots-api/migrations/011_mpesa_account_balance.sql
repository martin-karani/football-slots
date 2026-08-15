-- Migration 011: M-Pesa Account Balance Query Tracking
--
-- Tracks asynchronous Account Balance queries sent to Safaricom. The API is
-- async: we POST a request, get a sync acknowledgment with an
-- OriginatorConversationID, then receive the actual balances via a ResultURL
-- callback. This table bridges the two steps and caches the parsed balances
-- so the withdrawal service can check float availability without hitting
-- Safaricom on every withdrawal request.

CREATE TABLE IF NOT EXISTS mpesa_account_balance_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    originator_conversation_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'success', 'failed', 'timeout')),

    -- Parsed balances in minor units (cents). NULL until callback arrives.
    working_account_minor BIGINT,
    utility_account_minor BIGINT,
    merchant_account_minor BIGINT,
    charges_paid_account_minor BIGINT,

    raw_callback JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_balance_queries_created
    ON mpesa_account_balance_queries (created_at DESC);
