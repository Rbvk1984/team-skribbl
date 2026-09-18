-- =========================================================
-- Spyfall — Server-side functions
-- =========================================================

-- ---------- Starting a round ----------

create or replace function spyfall_start_round(p_room_id uuid, p_minutes int default 8)
returns void
language plpgsql security definer
as $$
declare
  v_player_count int;
  v_spy_player_id uuid;
  v_location text;
begin
  if not is_room_host(p_room_id) then
    raise exception 'only the host can start a round';
  end if;

  select count(*) into v_player_count from players where room_id = p_room_id;
  if v_player_count < 3 then
    raise exception 'need at least 3 players to start Spyfall';
  end if;

  select id into v_spy_player_id from players
    where room_id = p_room_id
    order by random() limit 1;

  select name into v_location from spyfall_locations
    where active = true
    order by random() limit 1;

  delete from spyfall_votes where room_id = p_room_id;

  insert into spyfall_games (room_id, location_name, spy_player_id, status, started_at, ends_at)
  values (p_room_id, v_location, v_spy_player_id, 'in_progress', now(), now() + (p_minutes || ' minutes')::interval)
  on conflict (room_id) do update
    set location_name = v_location,
        spy_player_id = v_spy_player_id,
        status = 'in_progress',
        winner = null,
        started_at = now(),
        ends_at = now() + (p_minutes || ' minutes')::interval,
        ended_at = null;

  update rooms set status = 'active' where id = p_room_id;
end;
$$;

grant execute on function spyfall_start_round(uuid, int) to authenticated;

-- ---------- Reading YOUR OWN role, and nobody else's ----------
-- This is the Spyfall equivalent of Skribbl's rounds_public view
-- and Codenames' codenames_cards_public view: a per-viewer read
-- that never leaks what it shouldn't.

create or replace function spyfall_my_role(p_room_id uuid)
returns table(am_i_spy boolean, location text)
language plpgsql security definer
as $$
declare
  v_row  spyfall_games;
  v_my_player_id uuid;
begin
  select id into v_my_player_id from players where room_id = p_room_id and user_id = auth.uid();
  select * into v_row from spyfall_games where room_id = p_room_id;

  if v_row.room_id is null or v_my_player_id is null then
    return query select null::boolean, null::text;
    return;
  end if;

  if v_row.spy_player_id = v_my_player_id then
    return query select true, null::text;
  else
    return query select false, v_row.location_name;
  end if;
end;
$$;

grant execute on function spyfall_my_role(uuid) to authenticated;

-- ---------- Casting / changing a suspicion vote ----------

create or replace function spyfall_cast_vote(p_room_id uuid, p_accused_player_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_my_player_id uuid;
begin
  select id into v_my_player_id from players where room_id = p_room_id and user_id = auth.uid();
  if v_my_player_id is null then
    raise exception 'not a player in this room';
  end if;

  insert into spyfall_votes (room_id, voter_player_id, accused_player_id, updated_at)
  values (p_room_id, v_my_player_id, p_accused_player_id, now())
  on conflict (room_id, voter_player_id) do update
    set accused_player_id = p_accused_player_id, updated_at = now();
end;
$$;

grant execute on function spyfall_cast_vote(uuid, uuid) to authenticated;

-- ---------- The spy guessing the location (one-shot) ----------

create or replace function spyfall_guess_location(p_room_id uuid, p_guess text)
returns table(correct boolean, actual_location text)
language plpgsql security definer
as $$
declare
  v_row spyfall_games;
  v_my_player_id uuid;
  v_correct boolean;
begin
  select id into v_my_player_id from players where room_id = p_room_id and user_id = auth.uid();
  select * into v_row from spyfall_games where room_id = p_room_id;

  if v_row.room_id is null or v_row.status <> 'in_progress' then
    raise exception 'no round in progress';
  end if;
  if v_row.spy_player_id <> v_my_player_id then
    raise exception 'only the spy can guess the location';
  end if;

  v_correct := lower(trim(p_guess)) = lower(trim(v_row.location_name));

  update spyfall_games
    set status = 'ended',
        winner = case when v_correct then 'spy' else 'others' end,
        ended_at = now()
    where room_id = p_room_id;

  return query select v_correct, v_row.location_name;
end;
$$;

grant execute on function spyfall_guess_location(uuid, text) to authenticated;

-- ---------- Ending the round (host calls this manually, or when time's up) ----------

create or replace function spyfall_end_round(p_room_id uuid)
returns table(spy_player_id uuid, location_name text, winner text, top_accused_player_id uuid)
language plpgsql security definer
as $$
declare
  v_row spyfall_games;
  v_top_accused uuid;
  v_winner text;
begin
  if not is_room_host(p_room_id) then
    raise exception 'only the host can end the round';
  end if;

  select * into v_row from spyfall_games where room_id = p_room_id;
  if v_row.room_id is null or v_row.status <> 'in_progress' then
    raise exception 'no round in progress';
  end if;

  select accused_player_id into v_top_accused
    from spyfall_votes
    where room_id = p_room_id
    group by accused_player_id
    order by count(*) desc
    limit 1;

  v_winner := case when v_top_accused = v_row.spy_player_id then 'others' else 'spy' end;

  update spyfall_games
    set status = 'ended', winner = v_winner, ended_at = now()
    where room_id = p_room_id;

  return query select v_row.spy_player_id, v_row.location_name, v_winner, v_top_accused;
end;
$$;

grant execute on function spyfall_end_round(uuid) to authenticated;
