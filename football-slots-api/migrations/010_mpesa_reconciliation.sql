-- Migration 010: M-Pesa Reconciliation, C2B Support & B2C Idempotency
--
-- Adds columns and constraints required by the Daraja API enhancements:
--   - originator_conversation_id: B2C v3 idempotency key (generated once per
--     withdrawal, reused on retry so Safaricom can detect duplicate submissions)
--   - c2b_bill_ref_number: Account reference the customer typed during a manual
--     Paybill payment; this is the ONLY reliable way to identify the recipient
--     because C2B v2 confirmation payloads contain a masked MSISDN
--   - Unique index on mpesa_receipt_number: prevents double-crediting when
--     Safaricom retries a C2B confirmation callback

-- B2C v3 idempotency: Safaricom rejects duplicate OriginatorConversationID
-- values, so storing it lets us detect whether a particular withdrawal was
-- already accepted before we decide to (re)submit.
ALTER TABLE mpesa_transactions
    ADD COLUMN IF NOT EXISTS originator_conversation_id TEXT;

-- C2B manual deposit: the BillRefNumber the customer enters when paying the
-- Paybill. We use this (not the masked MSISDN) to resolve the user account.
ALTER TABLE mpesa_transactions
    ADD COLUMN IF NOT EXISTS c2b_bill_ref_number TEXT;

-- Idempotency guard: every Safaricom TransID (mpesa_receipt_number) maps to
-- exactly one deposit row. If a callback is retried, the unique constraint
-- fires and the handler treats it as "already processed".
CREATE UNIQUE INDEX IF NOT EXISTS idx_mpesa_tx_receipt_unique
    ON mpesa_transactions (mpesa_receipt_number)
    WHERE mpesa_receipt_number IS NOT NULL AND mpesa_receipt_number != '';

-- Index for B2C result reconciliation by OriginatorConversationID.
CREATE INDEX IF NOT EXISTS idx_mpesa_tx_originator_conversation
    ON mpesa_transactions (originator_conversation_id)
    WHERE originator_conversation_id IS NOT NULL;
