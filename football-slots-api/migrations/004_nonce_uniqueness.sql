-- Migration 004: Nonce uniqueness constraint for provably fair integrity

ALTER TABLE game_rounds
    DROP CONSTRAINT IF EXISTS unique_user_nonce,
    ADD CONSTRAINT unique_user_nonce UNIQUE (user_id, nonce);
