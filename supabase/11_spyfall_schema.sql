-- =========================================================
-- Spyfall — Schema
--
-- Reuses rooms/players/access_codes/player_access exactly like
-- Codenames did. The only genuinely secret things in this game
-- are: (a) the location, hidden from the spy, and (b) who the
-- spy is, hidden from everyone until the round ends.
-- =========================================================

create table spyfall_locations (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  active boolean not null default true
);

-- One row per room describing the current/last round. Location
-- and spy identity live here but are NEVER selected directly by
-- the frontend — only through spyfall_my_role() (see functions
-- file), which is per-viewer and never leaks anyone else's role.
create table spyfall_games (
  room_id       uuid primary key references rooms(id) on delete cascade,
  location_name text not null,
  spy_player_id uuid not null references players(id),
  status        text not null default 'in_progress' check (status in ('in_progress', 'ended')),
  winner        text check (winner in ('spy', 'others')),
  started_at    timestamptz not null default now(),
  ends_at       timestamptz not null,
  ended_at      timestamptz
);

-- Who each player currently suspects. One row per player, they
-- can change their mind any time before the round ends. This is
-- NOT secret — seeing live suspicion is part of the fun — so it
-- gets a normal, permissive SELECT policy.
create table spyfall_votes (
  room_id           uuid not null references rooms(id) on delete cascade,
  voter_player_id   uuid not null references players(id) on delete cascade,
  accused_player_id uuid not null references players(id) on delete cascade,
  updated_at        timestamptz not null default now(),
  primary key (room_id, voter_player_id)
);

insert into spyfall_locations (name) values
  ('Beach'), ('Casino'), ('Airplane'), ('Bank'), ('Circus Tent'),
  ('Corporate Party'), ('Hospital'), ('Hotel'), ('Military Base'),
  ('Movie Studio'), ('Ocean Liner'), ('Passenger Train'), ('Pirate Ship'),
  ('Polar Station'), ('Police Station'), ('Restaurant'), ('School'),
  ('Space Station'), ('Submarine'), ('Supermarket'), ('Theater'),
  ('University'), ('Amusement Park'), ('Art Museum'), ('Coal Mine')
on conflict do nothing;
