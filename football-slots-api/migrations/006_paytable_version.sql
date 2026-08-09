-- Migration 006: Weighted RNG / paytable versioning
--
-- Why this column exists:
-- The RNG is moving from a uniform 1-of-24 draw to a *weighted* draw where
-- each symbol's win probability is derived from PAYTABLE (see
-- domain/models/game.rs). If PAYTABLE is ever retuned later (new RTP target,
-- new promo multiplier, etc.), old rounds must still verify against the
-- paytable that was ACTUALLY LIVE when they were spun, not whatever
-- PAYTABLE contains today. Without this column, re-running /verify on a
-- historical round after a paytable change would silently recompute the
-- wrong distribution and could falsely report a fair round as invalid (or
-- vice versa) -- a serious problem for a "provably fair" claim.
--
-- paytable_version 1 = the ladder introduced by this migration:
--   common x5, mid x10, rare x25, jackpot x100  ->  RTP = 20/21 ≈ 95.238%

ALTER TABLE game_rounds
    ADD COLUMN paytable_version SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN game_rounds.paytable_version IS
    'Which PAYTABLE_VERSIONS entry (domain::models::game) was active for this spin. Never renumber or mutate an existing version -- add a new one instead, so historical rounds keep verifying correctly.';
