-- Migration 005: Fix wheel position constraints from 14 to 24 positions
-- The wheel has 24 positions (8 symbols × 3 appearances), but the DB
-- constraints were capped at 14, causing INSERT failures (500 errors)
-- when the RNG generated positions 15-24.

-- Fix game_rounds.result_position constraint
-- Use DO block to find and drop the auto-generated constraint name.
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'game_rounds'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%result_position%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE game_rounds DROP CONSTRAINT %I', constraint_name);
    END IF;

    ALTER TABLE game_rounds
        ADD CONSTRAINT game_rounds_result_position_check
        CHECK (result_position BETWEEN 1 AND 24);
END $$;

-- Fix gamble_rounds.result_number constraint
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'gamble_rounds'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%result_number%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE gamble_rounds DROP CONSTRAINT %I', constraint_name);
    END IF;

    ALTER TABLE gamble_rounds
        ADD CONSTRAINT gamble_rounds_result_number_check
        CHECK (result_number BETWEEN 1 AND 24);
END $$;
