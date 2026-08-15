-- Migration 009: Wallet freeze support
--
-- Adds an is_frozen flag to wallets. When frozen, the wallet cannot be
-- debited (no bets, no withdrawals) but can still be credited (deposits,
-- reversals). This is used by admins to freeze suspicious accounts while
-- under investigation.

ALTER TABLE wallets ADD COLUMN is_frozen BOOLEAN NOT NULL DEFAULT FALSE;
