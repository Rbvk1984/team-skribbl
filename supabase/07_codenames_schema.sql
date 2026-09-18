-- =========================================================
-- Codenames — Schema
--
-- Reuses: rooms, players, access_codes, player_access from the
-- Skribbl foundation (see ARCHITECTURE.md "Future expansion").
-- Nothing about login, rooms, or the player list needs to be
-- rebuilt — only these three new tables.
-- =========================================================

-- Which team + role each player has taken for a given room's
-- current game. One row per player per room.
create table codenames_players (
  room_id    uuid not null references rooms(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  team       text not null check (team in ('red', 'blue')),
  role       text not null default 'operative' check (role in ('spymaster', 'operative')),
  joined_at  timestamptz not null default now(),
  primary key (room_id, player_id)
);

-- At most one spymaster per team per room.
create unique index one_spymaster_per_team
  on codenames_players (room_id, team)
  where role = 'spymaster';

-- The 25-card board. `color` is the secret part — visible to
-- spymasters always, and to everyone else only once `revealed`.
-- `word` itself is never secret; both teams read every word on
-- the grid from the start.
create table codenames_cards (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms(id) on delete cascade,
  idx        int not null check (idx between 0 and 24),
  word       text not null,
  color      text not null check (color in ('red', 'blue', 'neutral', 'assassin')),
  revealed   boolean not null default false,
  revealed_by_player_id uuid references players(id),
  revealed_at timestamptz,
  unique (room_id, idx)
);

-- One row per room describing whose turn it is and what's
-- happening right now. Nothing secret lives here.
create table codenames_games (
  room_id           uuid primary key references rooms(id) on delete cascade,
  current_team      text not null check (current_team in ('red', 'blue')),
  phase             text not null default 'clue' check (phase in ('clue', 'guessing', 'ended')),
  clue_word         text,
  clue_number       int,
  guesses_remaining int not null default 0,
  winner            text check (winner in ('red', 'blue')),
  starting_team     text not null check (starting_team in ('red', 'blue')),
  updated_at        timestamptz not null default now()
);

create index on codenames_players(room_id);
create index on codenames_cards(room_id);

-- ---------------------------------------------------------
-- Hidden-color view — the Codenames equivalent of Skribbl's
-- rounds_public view (see ARCHITECTURE.md "Hidden word").
--
-- Every room member can always see every word. `color` is only
-- included in the result if the card has been revealed, or the
-- viewer is a spymaster (either team — spymasters see the full
-- board, that's the point of the role).
-- ---------------------------------------------------------

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
  from codenames_cards cc;

grant select on codenames_cards_public to authenticated;
