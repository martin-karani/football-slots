-- Migration 007: Withdrawal support
--
-- Withdrawals reuse mpesa_transactions (direction = 'withdrawal') and its
-- STK-era columns, repurposed for B2C semantics:
--   checkout_request_id  -> B2C ConversationID            (idempotency key)
--   merchant_request_id  -> B2C OriginatorConversationID
--   mpesa_receipt_number -> B2C TransactionReceipt (on success)

-- Per-user override for the daily withdrawal cap, same pattern as the
-- existing daily_deposit_limit_minor. NULL falls back to Config's default.
ALTER TABLE users ADD COLUMN daily_withdrawal_limit_minor BIGINT;

-- DB-level guarantee that a user has at most one withdrawal in flight.
-- This can't live only in application code: a check-then-insert in the
-- service layer is racy under concurrent requests -- two simultaneous
-- withdraw calls could both pass the "no pending withdrawal" check before
-- either row exists. A partial unique index closes that race.
CREATE UNIQUE INDEX idx_one_pending_withdrawal_per_user
    ON mpesa_transactions (user_id)
    WHERE direction = 'withdrawal' AND status = 'pending';
