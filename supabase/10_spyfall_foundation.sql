-- =========================================================
-- Migration: allow rooms.game_type = 'spyfall'
-- Run once, after the Codenames files (06-09), before the
-- Spyfall files below.
-- =========================================================

alter table rooms drop constraint if exists rooms_game_type_check;
alter table rooms add constraint rooms_game_type_check
  check (game_type in ('skribbl', 'codenames', 'spyfall'));
