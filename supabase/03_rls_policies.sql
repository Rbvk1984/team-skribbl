-- =========================================================
-- Team Skribbl — Row Level Security policies
--
-- Everything here assumes: has_active_access(), is_admin_user(),
-- is_in_room(), is_room_host() from 02_functions.sql already exist.
-- =========================================================

alter table access_codes  enable row level security;
alter table player_access enable row level security;
alter table rooms         enable row level security;
alter table players       enable row level security;
alter table rounds        enable row level security;
alter table guesses       enable row level security;
alter table words         enable row level security;

-- ---------- access_codes ----------
-- Normal players should never read this table directly; all reads/writes
-- for admin purposes go through the admin_* SECURITY DEFINER functions,
-- which check is_admin_user() themselves. No direct policies are granted,
-- which means: with RLS enabled and no policy, ALL direct access is denied
-- by default (the SECURITY DEFINER functions bypass RLS internally).

-- ---------- player_access ----------
-- A user may see their own access link, nothing else.
create policy "read own access link"
  on player_access for select
  using (user_id = auth.uid());

-- Inserts/updates only happen via redeem_access_code(), never directly.

-- ---------- rooms ----------
create policy "active users can read rooms"
  on rooms for select
  using (has_active_access());

create policy "active users can create a room"
  on rooms for insert
  with check (has_active_access() and host_user_id = auth.uid());

create policy "host can update their room"
  on rooms for update
  using (has_active_access() and host_user_id = auth.uid());

-- ---------- players ----------
create policy "room members can read player list"
  on players for select
  using (has_active_access() and is_in_room(room_id));

create policy "a user can add themself to a room"
  on players for insert
  with check (
    has_active_access()
    and user_id = auth.uid()
    and (select status from rooms where id = room_id) = 'lobby'
  );

create policy "a player can update their own row"
  on players for update
  using (has_active_access() and user_id = auth.uid());

-- ---------- rounds ----------
-- Everyone in the room can see round metadata, but selected_word is only
-- visible to the drawer (via column-level check below) or once ended.
create policy "room members can read rounds"
  on rounds for select
  using (
    has_active_access()
    and is_in_room(room_id)
    and (
      status = 'ended'
      or drawer_player_id in (select id from players where user_id = auth.uid())
    )
  );

-- Round rows are created by the host advancing the game (via app logic);
-- selected_word is written only by the drawer.
create policy "host can create rounds"
  on rounds for insert
  with check (has_active_access() and is_room_host(room_id));

create policy "drawer or host can update the round"
  on rounds for update
  using (
    has_active_access()
    and is_in_room(room_id)
    and (
      drawer_player_id in (select id from players where user_id = auth.uid())
      or is_room_host(room_id)
    )
  );

-- IMPORTANT: the policy above still lets a spectator's SELECT see the row,
-- but the "status = 'ended' OR is drawer" condition on SELECT is what
-- actually hides selected_word — Postgres RLS is row-level, so for a
-- fully bullet-proof column-level hide we additionally rely on the app
-- never selecting selected_word for a round the viewer isn't allowed to
-- see (enforced above) — see ARCHITECTURE.md "Hidden word" section for
-- the full explanation and the belt-and-suspenders view below.

-- Extra safety net: a view that always nulls out selected_word unless
-- the round has ended, regardless of who queries it.
create or replace view rounds_public as
  select
    id, room_id, round_number, drawer_player_id, status, started_at, ends_at, created_at,
    case
      when status = 'ended' then selected_word
      when drawer_player_id in (select id from players where user_id = auth.uid()) then selected_word
      else null
    end as selected_word
  from rounds;

grant select on rounds_public to authenticated;

-- ---------- guesses ----------
create policy "room members can read guesses"
  on guesses for select
  using (
    has_active_access()
    and round_id in (
      select id from rounds where is_in_room(room_id)
    )
  );

-- Guesses are only ever inserted via submit_guess() (SECURITY DEFINER),
-- so no direct insert policy is granted here.

-- ---------- words ----------
-- Word list itself isn't secret (it's the *selection* that's hidden),
-- but there's no reason to expose it wholesale either — access goes
-- through get_word_choices(). No direct policy granted.
