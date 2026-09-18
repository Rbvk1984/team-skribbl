-- =========================================================
-- Spyfall — Row Level Security policies
-- =========================================================

alter table spyfall_locations enable row level security;
alter table spyfall_games     enable row level security;
alter table spyfall_votes     enable row level security;

-- Location names aren't secret as a LIST (everyone could look up
-- "what are all possible Spyfall locations" if they wanted to,
-- same as knowing the rules) — what's secret is which ONE was
-- picked for this round, which lives in spyfall_games and is
-- deliberately not exposed there either. Fine to let room members
-- read the list, e.g. for a spy's location-guess autocomplete.
create policy "anyone can read the location list"
  on spyfall_locations for select
  using (has_active_access());

-- spyfall_games: deliberately NO select policy. location_name and
-- spy_player_id must never be selected directly by any player —
-- only through spyfall_my_role() (SECURITY DEFINER), which returns
-- just the calling player's own, correctly-masked view of it.
-- (The host's start/end functions and the spy's guess function
-- also go through SECURITY DEFINER functions, never direct writes.)

-- spyfall_votes: not secret, safe to read/write directly by room members.
create policy "room members can read votes"
  on spyfall_votes for select
  using (has_active_access() and is_in_room(room_id));

-- Writes still go through spyfall_cast_vote() so a player can only
-- ever cast a vote as themselves, but the SELECT above is plain
-- table access since there's nothing to hide here.

-- ---------------------------------------------------------
-- Masked view for round status/timer. Every room member needs
-- to see whether a round is running and when it ends (for the
-- countdown), but not who the spy is or what the location is —
-- UNLESS the round has ended, at which point that's exactly the
-- "reveal" everyone is waiting for.
-- ---------------------------------------------------------

create or replace view spyfall_games_public as
  select
    room_id, status, winner, started_at, ends_at, ended_at,
    case when status = 'ended' then location_name else null end as revealed_location,
    case when status = 'ended' then spy_player_id else null end as revealed_spy_player_id
  from spyfall_games
  where has_active_access() and is_in_room(room_id);

grant select on spyfall_games_public to authenticated;
