-- Migration 008: Bonus meter grants with wagering tracking
--
-- The existing bonus_progress table tracks meter fill state.
-- This migration adds bonus_grants to track the lifecycle of awarded
-- bonuses through wagering requirements to conversion or loss.

-- Adjust existing meter target from 300 to 50 (too long for retention at current scale)
ALTER TABLE bonus_progress
ALTER COLUMN target_value SET DEFAULT 50;

-- Reset existing progress to avoid immediate claims under new lower target
UPDATE bonus_progress
SET target_value = 50, current_value = 0, updated_at = now();

-- Bonus grants table
CREATE TABLE IF NOT EXISTS bonus_grants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'spin_meter',
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    wager_multiplier INT NOT NULL DEFAULT 5,
    wager_required_minor BIGINT NOT NULL CHECK (wager_required_minor >= 0),
    wagered_minor BIGINT NOT NULL DEFAULT 0 CHECK (wagered_minor >= 0),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'lost', 'expired', 'cancelled')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_bonus_grants_user_status ON bonus_grants (user_id, status);
CREATE INDEX idx_bonus_grants_expires ON bonus_grants (expires_at) WHERE status = 'active';

-- Only one active grant per user (DB-enforced, not just application-level)
CREATE UNIQUE INDEX idx_one_active_bonus_grant_per_user
ON bonus_grants (user_id)
WHERE status = 'active';
