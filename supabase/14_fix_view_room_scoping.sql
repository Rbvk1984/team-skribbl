-- =========================================================
-- Fix: room-scope the earlier masked views
--
-- rounds_public (Skribbl) and codenames_cards_public (Codenames)
-- correctly hid the SECRET column (the word / the color) from
-- anyone who shouldn't see it — but neither view checked that
-- the viewer is actually a member of that room at all. In
-- practice this meant: the hidden data itself never leaked, but
-- a signed-in user could look up board metadata (words, round
-- status) for a room they're not even playing in, just by
-- knowing or guessing its room_id. This closes that gap the
-- same way spyfall_games_public does it from the start.
-- =========================================================

create or replace view rounds_public as
  select
    id, room_id, round_number, drawer_player_id, status, started_at, ends_at, created_at,
    case
      when status = 'ended' then selected_word
      when drawer_player_id in (select id from players where user_id = auth.uid()) then selected_word
      else null
    end as selected_word
  from rounds
  where has_active_access() and is_in_room(room_id);

create or replace view codenames_cards_public as
  select
    cc.id, cc.room_id, cc.idx, cc.word, cc.revealed, cc.revealed_at,
    case
      when cc.revealed then cc.color
      when exists (
        select 1 from codenames_players cp
        join players p on p.id = cp.player_id
        where cp.room_id = cc.room_id
          and p.user_id = auth.uid()
          and cp.role = 'spymaster'
      ) then cc.color
      else null
    end as color
  from codenames_cards cc
  where has_active_access() and is_in_room(cc.room_id);
