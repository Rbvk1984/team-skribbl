-- =========================================================
-- Gartic Phone — Row Level Security policies
-- =========================================================

alter table gp_games   enable row level security;
alter table gp_books   enable row level security;
alter table gp_entries enable row level security;

-- gp_games: no secrets — room members can read freely.
-- Realtime Postgres Changes subscription is safe here.
create policy "room members can read gp_games"
  on gp_games for select
  using (has_active_access() and is_in_room(room_id));

-- gp_books: no secrets — just player order info.
create policy "room members can read gp_books"
  on gp_books for select
  using (has_active_access() and is_in_room(room_id));

-- gp_entries: NO direct SELECT policy.
-- All reads go through gp_get_my_prompt() (enforces the
-- "previous entry only" rule during the game) and
-- gp_get_reveal_entries() (only works during reveal phase).
-- All writes go through gp_submit_entry() (SECURITY DEFINER).

-- No INSERT/UPDATE/DELETE policies on any table —
-- all writes go through SECURITY DEFINER functions.
