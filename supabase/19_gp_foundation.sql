-- =========================================================
-- Migration: allow rooms.game_type = 'gartic_phone'
-- Run once, after file 18.
-- =========================================================

alter table rooms drop constraint if exists rooms_game_type_check;
alter table rooms add constraint rooms_game_type_check
  check (game_type in ('skribbl', 'codenames', 'spyfall', 'secret_hitler', 'gartic_phone'));
