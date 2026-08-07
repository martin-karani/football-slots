-- Migration 002: Game tables (game_rounds, gamble_rounds, bonus_progress)

-- One row per spin. bets is {"whistle": 500, "trophy": 200, ...} in minor units.
-- server_seed_hash is shown to the client BEFORE the spin; server_seed is
-- revealed after (on seed rotation), so any round can be independently
-- verified: HMAC-SHA256(server_seed, client_seed:nonce) -> position 1..14.
CREATE TABLE game_rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency currency_type NOT NULL,
    total_stake_minor BIGINT NOT NULL,
    bets JSONB NOT NULL,
    result_position SMALLINT NOT NULL CHECK (result_position BETWEEN 1 AND 14),
    result_symbol TEXT NOT NULL,
    result_multiplier SMALLINT NOT NULL,
    gross_payout_minor BIGINT NOT NULL DEFAULT 0,
    net_result_minor BIGINT NOT NULL,
    is_win BOOLEAN NOT NULL,
    server_seed_hash TEXT NOT NULL,
    server_seed TEXT,
    client_seed TEXT NOT NULL,
    nonce BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_game_rounds_user_time ON game_rounds (user_id, created_at DESC);
CREATE INDEX idx_game_rounds_nonce ON game_rounds (nonce);

-- The "Home/Away" (Big/Small) double-up. Independent draw, references the
-- winning round it's gambling on. Capped to one gamble per round.
CREATE TABLE gamble_rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_round_id UUID NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stake_minor BIGINT NOT NULL,       -- the win amount being gambled
    choice TEXT NOT NULL CHECK (choice IN ('home', 'away')),
    result_number SMALLINT NOT NULL CHECK (result_number BETWEEN 1 AND 14),
    won BOOLEAN NOT NULL,
    payout_minor BIGINT NOT NULL,      -- 0 if lost, 2*stake if won
    net_result_minor BIGINT NOT NULL,  -- payout - stake (0 or stake)
    server_seed_hash TEXT NOT NULL,
    server_seed TEXT,
    client_seed TEXT NOT NULL,
    nonce BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_gamble_one_per_round ON gamble_rounds (game_round_id);
CREATE INDEX idx_gamble_rounds_user_time ON gamble_rounds (user_id, created_at DESC);

-- Bonus progress meter (e.g., "Goal Bonus" — every 300 spins, get bonus credits)
CREATE TABLE bonus_progress (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    meter_key TEXT NOT NULL DEFAULT 'goal_bonus',
    current_value INT NOT NULL DEFAULT 0,
    target_value INT NOT NULL DEFAULT 300,
    last_claimed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, meter_key)
);
