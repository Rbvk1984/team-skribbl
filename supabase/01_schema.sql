-- =========================================================
-- Team Skribbl — Core Schema
-- Run this in the Supabase SQL editor (or via CLI migration)
-- =========================================================

create extension if not exists pgcrypto;   -- for digest() used to hash passcodes

-- ---------------------------------------------------------
-- ACCESS CONTROL
-- Nobody can use the app just by knowing the GitHub Pages URL.
-- Every browser signs in anonymously (Supabase Auth), then must
-- redeem an admin-issued passcode before any gameplay table
-- will accept requests from that user (enforced by RLS, not JS).
-- ---------------------------------------------------------

create table access_codes (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,               -- e.g. "Priya", "Main Admin"
  code_hash    text not null unique,        -- sha256(passcode), never the plaintext
  is_admin     boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

-- Links a signed-in (anonymous) auth user to the code they redeemed.
-- One row per browser/session identity. Re-redeeming updates it.
create table player_access (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  access_code_id  uuid not null references access_codes(id) on delete cascade,
  redeemed_at     timestamptz not null default now()
);

-- ---------------------------------------------------------
-- GAMEPLAY
-- ---------------------------------------------------------

create table rooms (
  id             uuid primary key default gen_random_uuid(),
  room_code      text not null unique,               -- short human-shareable code, e.g. "FOX-427"
  host_user_id   uuid not null references auth.users(id),
  status         text not null default 'lobby'        -- lobby | choosing | drawing | reveal | finished
                   check (status in ('lobby','choosing','drawing','reveal','finished')),
  current_round  int not null default 0,
  total_rounds   int not null default 3,
  round_seconds  int not null default 80,
  created_at     timestamptz not null default now()
);

create table players (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  display_name  text not null,
  score         int not null default 0,
  is_connected  boolean not null default true,
  joined_at     timestamptz not null default now(),
  unique (room_id, user_id)
);

create table rounds (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references rooms(id) on delete cascade,
  round_number      int not null,
  drawer_player_id  uuid not null references players(id),
  selected_word     text,                              -- NULL until drawer picks one
  status            text not null default 'choosing'    -- choosing | drawing | ended
                       check (status in ('choosing','drawing','ended')),
  started_at        timestamptz,
  ends_at           timestamptz,                        -- authoritative deadline, clients derive countdown from this
  created_at        timestamptz not null default now(),
  unique (room_id, round_number)
);

create table guesses (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references rounds(id) on delete cascade,
  player_id       uuid not null references players(id),
  guess_text      text not null,
  correct         boolean not null default false,
  points_awarded  int not null default 0,
  guessed_at      timestamptz not null default now()
);

create table words (
  id          uuid primary key default gen_random_uuid(),
  word        text not null,
  difficulty  text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  category    text default 'general',
  active      boolean not null default true
);

create index on players(room_id);
create index on rounds(room_id);
create index on guesses(round_id);
create index on words(active);
