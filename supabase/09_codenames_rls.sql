-- =========================================================
-- Codenames — Row Level Security policies
-- =========================================================

alter table codenames_players enable row level security;
alter table codenames_cards   enable row level security;
alter table codenames_games   enable row level security;

-- ---------- codenames_players ----------
-- Room members can see everyone's team/role (that's public
-- information at the table — you can see who's on which team).
create policy "room members can read codenames_players"
  on codenames_players for select
  using (has_active_access() and is_in_room(room_id));

-- A player can pick their own team/role.
create policy "a player can set their own team and role"
  on codenames_players for insert
  with check (
    has_active_access()
    and player_id in (select id from players where user_id = auth.uid() and room_id = codenames_players.room_id)
  );

create policy "a player can change their own team and role"
  on codenames_players for update
  using (
    has_active_access()
    and player_id in (select id from players where user_id = auth.uid() and room_id = codenames_players.room_id)
  );

create policy "a player can leave their team"
  on codenames_players for delete
  using (
    has_active_access()
    and player_id in (select id from players where user_id = auth.uid() and room_id = codenames_players.room_id)
  );

-- ---------- codenames_cards ----------
-- Deliberately NO select policy on the raw table — everyone,
-- including the frontend, reads through codenames_cards_public
-- (see 07_codenames_schema.sql), which is the only thing that
-- correctly masks the `color` column per viewer.
--
-- Inserts/updates only ever happen via codenames_start_game()
-- and codenames_reveal_card() (SECURITY DEFINER), never directly.

-- ---------- codenames_games ----------
-- Nothing secret here — whose turn it is, the clue, remaining
-- guesses, and the winner are all fine for every room member
-- to read directly.
create policy "room members can read codenames_games"
  on codenames_games for select
  using (has_active_access() and is_in_room(room_id));

-- All writes go through codenames_start_game(), codenames_give_clue(),
-- codenames_reveal_card(), and codenames_pass_turn() — no direct
-- insert/update policy is granted.
