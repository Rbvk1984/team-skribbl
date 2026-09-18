-- =========================================================
-- Migration: make `rooms` reusable across multiple games
--
-- Run this once in the SQL editor, after 01-05, before the
-- Codenames files below.
--
-- Why: rooms.status previously had a CHECK constraint locked to
-- Skribbl's specific phase names ('lobby','choosing','drawing',
-- 'reveal','finished'). That doesn't generalize to other games
-- with different phases (like Codenames). We add a `game_type`
-- column so a room knows which game it belongs to, and loosen
-- the status constraint so each game can define its own status
-- vocabulary in its own tables instead of fighting one shared
-- constraint. Skribbl's existing code is unaffected — it still
-- writes the same status strings it always did.
-- =========================================================

alter table rooms
  add column if not exists game_type text not null default 'skribbl'
    check (game_type in ('skribbl', 'codenames'));

alter table rooms drop constraint if exists rooms_status_check;
-- status is now just a free-form text column; each game's own
-- functions/RLS decide what values are valid for that game.
