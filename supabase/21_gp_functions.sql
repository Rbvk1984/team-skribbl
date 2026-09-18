-- =========================================================
-- Gartic Phone — Server-side functions
-- =========================================================

-- ---------- Rotation helper ----------
-- In round R (1-based), the holder of book at position B
-- (0-based) is the player at position (B + R - 1) mod N.
-- The book at position P in round R is held by the player
-- whose book_order = P, so the book held by player P in
-- round R is: book_order = (P - R + 1 + N) mod N.

create or replace function gp_my_book_order(p_room_id uuid, p_round int)
returns int
language sql stable security definer
as $$
  with n as (select count(*)::int as cnt from gp_books where room_id = p_room_id),
       me as (
         select b.book_order from gp_books b
         join players p on p.id = b.owner_player_id
         where b.room_id = p_room_id and p.user_id = auth.uid()
       )
  select ((select book_order from me) - p_round + 1 + (select cnt from n)) % (select cnt from n);
$$;

-- ---------- Start game ----------

create or replace function gp_start_game(p_room_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_players  record;
  v_order    int := 0;
  v_count    int;
begin
  if not is_room_host(p_room_id) then
    raise exception 'only the host can start the game';
  end if;

  select count(*) into v_count from players where room_id = p_room_id;
  if v_count < 3 then
    raise exception 'Gartic Phone needs at least 3 players';
  end if;

  delete from gp_books  where room_id = p_room_id;
  delete from gp_games  where room_id = p_room_id;

  for v_players in
    select id from players where room_id = p_room_id order by joined_at
  loop
    insert into gp_books (room_id, owner_player_id, book_order)
    values (p_room_id, v_players.id, v_order);
    v_order := v_order + 1;
  end loop;

  insert into gp_games (
    room_id, status, current_round, total_rounds, submissions_this_round, reveal_book_index
  ) values (
    p_room_id, 'writing', 1, v_count, 0, 0
  );

  update rooms set status = 'active' where id = p_room_id;
end;
$$;

grant execute on function gp_start_game(uuid) to authenticated;

-- ---------- Get the previous entry (the "prompt" for this round) ----------
-- Returns the immediately previous entry of the book the caller
-- currently holds. Returns null for round 1 (no previous entry).
-- This is the ONLY way to read another player's entry during the game.

create or replace function gp_get_my_prompt(p_room_id uuid)
returns table(
  entry_type   text,
  content      text,
  round_number int,
  author_name  text
)
language plpgsql stable security definer
as $$
declare
  v_game         gp_games;
  v_book_order   int;
  v_book_id      uuid;
  v_prev_round   int;
begin
  select * into v_game from gp_games where room_id = p_room_id;
  if v_game.room_id is null then return; end if;
  if v_game.current_round = 1 then return; end if;  -- no prompt for round 1

  v_book_order := gp_my_book_order(p_room_id, v_game.current_round);
  select id into v_book_id from gp_books where room_id = p_room_id and book_order = v_book_order;
  v_prev_round := v_game.current_round - 1;

  return query
    select e.entry_type, e.content, e.round_number, p.display_name
    from gp_entries e
    join players p on p.id = e.author_player_id
    where e.book_id = v_book_id and e.round_number = v_prev_round;
end;
$$;

grant execute on function gp_get_my_prompt(uuid) to authenticated;

-- ---------- Submit an entry ----------

create or replace function gp_submit_entry(p_room_id uuid, p_content text)
returns void
language plpgsql security definer
as $$
declare
  v_game         gp_games;
  v_my_player_id uuid;
  v_book_order   int;
  v_book_id      uuid;
  v_entry_type   text;
  v_player_count int;
  v_already      boolean;
  v_new_round    int;
  v_new_status   text;
begin
  select * into v_game from gp_games where room_id = p_room_id;
  if v_game.room_id is null then raise exception 'no game in progress'; end if;
  if v_game.status not in ('writing', 'drawing') then
    raise exception 'not an entry-submission phase';
  end if;

  select id into v_my_player_id from players where room_id = p_room_id and user_id = auth.uid();
  select count(*)::int into v_player_count from players where room_id = p_room_id;

  v_entry_type := case when v_game.current_round % 2 = 1 then 'text' else 'drawing' end;
  v_book_order := gp_my_book_order(p_room_id, v_game.current_round);

  select id into v_book_id from gp_books where room_id = p_room_id and book_order = v_book_order;

  -- Idempotent: ignore double-submits
  select exists(
    select 1 from gp_entries where book_id = v_book_id and round_number = v_game.current_round
  ) into v_already;
  if v_already then return; end if;

  insert into gp_entries (book_id, round_number, author_player_id, entry_type, content)
  values (v_book_id, v_game.current_round, v_my_player_id, v_entry_type, p_content);

  -- Advance submission counter
  update gp_games
    set submissions_this_round = submissions_this_round + 1, updated_at = now()
    where room_id = p_room_id;

  -- Check if all players submitted
  if v_game.submissions_this_round + 1 >= v_player_count then
    v_new_round := v_game.current_round + 1;

    if v_new_round > v_game.total_rounds then
      -- All rounds done → reveal phase
      update gp_games set
        status = 'reveal', current_round = v_game.total_rounds,
        submissions_this_round = 0, reveal_book_index = 0, updated_at = now()
        where room_id = p_room_id;
    else
      v_new_status := case when v_new_round % 2 = 1 then 'writing' else 'drawing' end;
      update gp_games set
        status = v_new_status, current_round = v_new_round,
        submissions_this_round = 0, updated_at = now()
        where room_id = p_room_id;
    end if;
  end if;
end;
$$;

grant execute on function gp_submit_entry(uuid, text) to authenticated;

-- ---------- Check if I've already submitted this round ----------

create or replace function gp_have_i_submitted(p_room_id uuid)
returns boolean
language plpgsql stable security definer
as $$
declare
  v_game         gp_games;
  v_my_player_id uuid;
  v_book_order   int;
  v_book_id      uuid;
begin
  select * into v_game from gp_games where room_id = p_room_id;
  select id into v_my_player_id from players where room_id = p_room_id and user_id = auth.uid();
  v_book_order := gp_my_book_order(p_room_id, v_game.current_round);
  select id into v_book_id from gp_books where room_id = p_room_id and book_order = v_book_order;
  return exists (
    select 1 from gp_entries where book_id = v_book_id and round_number = v_game.current_round
  );
end;
$$;

grant execute on function gp_have_i_submitted(uuid) to authenticated;

-- ---------- Reveal: get all entries for the current book ----------

create or replace function gp_get_reveal_entries(p_room_id uuid)
returns table(
  round_number int,
  entry_type   text,
  content      text,
  author_name  text
)
language plpgsql stable security definer
as $$
declare v_game gp_games;
begin
  select * into v_game from gp_games where room_id = p_room_id;
  if v_game.status <> 'reveal' then
    raise exception 'not in reveal phase';
  end if;

  return query
    select e.round_number, e.entry_type, e.content, p.display_name
    from gp_entries e
    join gp_books b on b.id = e.book_id
    join players p on p.id = e.author_player_id
    where b.room_id = p_room_id and b.book_order = v_game.reveal_book_index
    order by e.round_number;
end;
$$;

grant execute on function gp_get_reveal_entries(uuid) to authenticated;

-- ---------- Reveal: advance to next book ----------

create or replace function gp_advance_reveal(p_room_id uuid)
returns void
language plpgsql security definer
as $$
declare v_game gp_games;
begin
  if not is_room_host(p_room_id) then
    raise exception 'only the host can advance the reveal';
  end if;
  select * into v_game from gp_games where room_id = p_room_id;
  if v_game.status <> 'reveal' then raise exception 'not in reveal phase'; end if;

  if v_game.reveal_book_index + 1 >= v_game.total_rounds then
    update gp_games set status = 'ended', updated_at = now() where room_id = p_room_id;
    update rooms set status = 'finished' where id = p_room_id;
  else
    update gp_games
      set reveal_book_index = reveal_book_index + 1, updated_at = now()
      where room_id = p_room_id;
  end if;
end;
$$;

grant execute on function gp_advance_reveal(uuid) to authenticated;
