-- =========================================================
-- Gartic Phone — Schema
--
-- Key design principle: drawings must be PERSISTED (unlike
-- Skribbl where strokes are ephemeral broadcasts). Each
-- drawing is stored as a JSON array of stroke objects
-- (normalized 0-1 coordinates, ~5-30 KB per drawing) rather
-- than a PNG (50-200 KB) so the free-tier 500 MB database
-- limit is never a concern for a small team.
--
-- Hidden-information rule: during the game you may only see
-- the IMMEDIATELY PREVIOUS entry in the book you currently
-- hold — nothing earlier. This is enforced via SECURITY
-- DEFINER functions; gp_entries has no direct SELECT policy.
-- =========================================================

-- Main game state — no secrets, safe to subscribe to directly.
create table gp_games (
  room_id              uuid primary key references rooms(id) on delete cascade,
  status               text not null default 'writing'
    check (status in ('writing', 'drawing', 'reveal', 'ended')),
  current_round        int not null default 1,
  total_rounds         int not null,
  submissions_this_round int not null default 0,
  reveal_book_index    int not null default 0,  -- which book is on screen during reveal
  updated_at           timestamptz not null default now()
);

-- One book per player — the book belongs to whoever started it.
create table gp_books (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references rooms(id) on delete cascade,
  owner_player_id  uuid not null references players(id),
  book_order       int  not null,  -- 0-based position in the player circle
  unique (room_id, book_order)
);

-- One entry per book per round — the actual content.
-- NO SELECT policy: all reads go through SECURITY DEFINER
-- functions that enforce the "previous entry only" rule.
create table gp_entries (
  id                uuid primary key default gen_random_uuid(),
  book_id           uuid not null references gp_books(id) on delete cascade,
  round_number      int  not null,
  author_player_id  uuid not null references players(id),
  entry_type        text not null check (entry_type in ('text', 'drawing')),
  -- text entries: the prompt/caption string
  -- drawing entries: JSON array of stroke objects
  --   [{from:{x,y}, to:{x,y}, color, width, type:"line"|"clear"}, ...]
  --   coordinates are normalized 0-1 so they render correctly
  --   at any canvas size
  content           text not null,
  submitted_at      timestamptz not null default now(),
  unique (book_id, round_number)
);

create index on gp_books(room_id);
create index on gp_entries(book_id);
create index on gp_entries(author_player_id);
