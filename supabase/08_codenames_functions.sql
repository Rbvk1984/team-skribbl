-- =========================================================
-- Codenames — Server-side functions
--
-- Same philosophy as Skribbl's 02_functions.sql: plain
-- SECURITY DEFINER Postgres functions, no Edge Functions, no
-- external secrets needed. These are what actually enforce the
-- rules — the frontend just calls them and reacts to the result.
-- =========================================================

create or replace function is_codenames_spymaster(p_room_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from codenames_players cp
    join players p on p.id = cp.player_id
    where cp.room_id = p_room_id and p.user_id = auth.uid() and cp.role = 'spymaster'
  );
$$;

create or replace function my_codenames_team(p_room_id uuid)
returns text
language sql stable security definer
as $$
  select cp.team from codenames_players cp
  join players p on p.id = cp.player_id
  where cp.room_id = p_room_id and p.user_id = auth.uid()
  limit 1;
$$;

-- ---------- Starting a game: build and shuffle the board ----------

create or replace function codenames_start_game(p_room_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_red_spymasters  int;
  v_blue_spymasters int;
  v_starting_team   text;
  v_word            record;
  v_idx             int := 0;
  v_color           text;
  v_red_count       int := 0;
  v_blue_count      int := 0;
begin
  if not is_room_host(p_room_id) then
    raise exception 'only the host can start the game';
  end if;

  select count(*) into v_red_spymasters  from codenames_players where room_id = p_room_id and team = 'red'  and role = 'spymaster';
  select count(*) into v_blue_spymasters from codenames_players where room_id = p_room_id and team = 'blue' and role = 'spymaster';

  if v_red_spymasters <> 1 or v_blue_spymasters <> 1 then
    raise exception 'each team needs exactly one spymaster before starting';
  end if;

  delete from codenames_cards where room_id = p_room_id;

  v_starting_team := (array['red', 'blue'])[floor(random() * 2 + 1)];

  -- 9 cards for the starting team, 8 for the other, 7 neutral, 1 assassin = 25
  for v_word in (select word from words where active = true order by random() limit 25) loop
    if v_idx = 0 then
      v_color := 'assassin';
    elsif v_starting_team = 'red' then
      if v_red_count < 9 then v_color := 'red'; v_red_count := v_red_count + 1;
      elsif v_blue_count < 8 then v_color := 'blue'; v_blue_count := v_blue_count + 1;
      else v_color := 'neutral';
      end if;
    else
      if v_blue_count < 9 then v_color := 'blue'; v_blue_count := v_blue_count + 1;
      elsif v_red_count < 8 then v_color := 'red'; v_red_count := v_red_count + 1;
      else v_color := 'neutral';
      end if;
    end if;

    insert into codenames_cards (room_id, idx, word, color)
    values (p_room_id, v_idx, v_word.word, v_color);

    v_idx := v_idx + 1;
  end loop;

  insert into codenames_games (room_id, current_team, phase, guesses_remaining, starting_team, updated_at)
  values (p_room_id, v_starting_team, 'clue', 0, v_starting_team, now())
  on conflict (room_id) do update
    set current_team = v_starting_team,
        phase = 'clue',
        clue_word = null,
        clue_number = null,
        guesses_remaining = 0,
        winner = null,
        starting_team = v_starting_team,
        updated_at = now();

  update rooms set status = 'active' where id = p_room_id;
end;
$$;

grant execute on function codenames_start_game(uuid) to authenticated;

-- ---------- Giving a clue ----------

create or replace function codenames_give_clue(p_room_id uuid, p_word text, p_number int)
returns void
language plpgsql security definer
as $$
declare
  v_game codenames_games;
begin
  select * into v_game from codenames_games where room_id = p_room_id;

  if v_game.room_id is null then
    raise exception 'no game in progress';
  end if;
  if v_game.phase <> 'clue' then
    raise exception 'not the clue phase';
  end if;
  if not is_codenames_spymaster(p_room_id) or my_codenames_team(p_room_id) <> v_game.current_team then
    raise exception 'only the current team''s spymaster can give a clue';
  end if;
  if p_number < 0 or p_number > 9 then
    raise exception 'clue number must be between 0 and 9';
  end if;

  update codenames_games
    set clue_word = p_word,
        clue_number = p_number,
        guesses_remaining = p_number + 1,
        phase = 'guessing',
        updated_at = now()
    where room_id = p_room_id;
end;
$$;

grant execute on function codenames_give_clue(uuid, text, int) to authenticated;

-- ---------- Revealing a card (the core rules engine) ----------

create or replace function codenames_reveal_card(p_room_id uuid, p_idx int)
returns table(color text, turn_ended boolean, winner text)
language plpgsql security definer
as $$
declare
  v_game        codenames_games;
  v_card        codenames_cards;
  v_player_id   uuid;
  v_my_team     text;
  v_next_team   text;
  v_turn_ended  boolean := false;
  v_winner      text := null;
  v_remaining_own_cards int;
begin
  select * into v_game from codenames_games where room_id = p_room_id;
  if v_game.room_id is null or v_game.phase <> 'guessing' then
    raise exception 'not the guessing phase';
  end if;

  v_my_team := my_codenames_team(p_room_id);
  if v_my_team is distinct from v_game.current_team then
    raise exception 'not your team''s turn';
  end if;
  if is_codenames_spymaster(p_room_id) then
    raise exception 'spymasters cannot reveal cards';
  end if;

  select id into v_player_id from players where room_id = p_room_id and user_id = auth.uid();

  select * into v_card from codenames_cards where room_id = p_room_id and idx = p_idx;
  if v_card.id is null then
    raise exception 'no such card';
  end if;
  if v_card.revealed then
    return query select v_card.color, false, null::text;
    return;
  end if;

  update codenames_cards
    set revealed = true, revealed_by_player_id = v_player_id, revealed_at = now()
    where id = v_card.id;

  v_next_team := case when v_game.current_team = 'red' then 'blue' else 'red' end;

  if v_card.color = 'assassin' then
    v_winner := v_next_team;
    update codenames_games set phase = 'ended', winner = v_winner, updated_at = now() where room_id = p_room_id;
    v_turn_ended := true;

  elsif v_card.color = v_game.current_team then
    -- correct guess: does this complete the team's whole board?
    select count(*) into v_remaining_own_cards
      from codenames_cards
      where room_id = p_room_id and color = v_game.current_team and revealed = false;

    if v_remaining_own_cards = 0 then
      v_winner := v_game.current_team;
      update codenames_games set phase = 'ended', winner = v_winner, updated_at = now() where room_id = p_room_id;
      v_turn_ended := true;
    else
      update codenames_games set guesses_remaining = guesses_remaining - 1, updated_at = now() where room_id = p_room_id;
      if v_game.guesses_remaining - 1 <= 0 then
        update codenames_games
          set current_team = v_next_team, phase = 'clue', clue_word = null, clue_number = null, guesses_remaining = 0, updated_at = now()
          where room_id = p_room_id;
        v_turn_ended := true;
      end if;
    end if;

  else
    -- wrong color (neutral or the other team's) — turn ends immediately
    v_turn_ended := true;

    if v_card.color in ('red', 'blue') then
      select count(*) into v_remaining_own_cards
        from codenames_cards
        where room_id = p_room_id and color = v_card.color and revealed = false;
      if v_remaining_own_cards = 0 then
        -- the guessing team accidentally revealed the opposing team's last card
        v_winner := v_card.color;
        update codenames_games set phase = 'ended', winner = v_winner, updated_at = now() where room_id = p_room_id;
      end if;
    end if;

    if v_winner is null then
      update codenames_games
        set current_team = v_next_team, phase = 'clue', clue_word = null, clue_number = null, guesses_remaining = 0, updated_at = now()
        where room_id = p_room_id;
    end if;
  end if;

  return query select v_card.color, v_turn_ended, v_winner;
end;
$$;

grant execute on function codenames_reveal_card(uuid, int) to authenticated;

-- ---------- Voluntarily ending your team's turn early ----------

create or replace function codenames_pass_turn(p_room_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_game codenames_games;
  v_next_team text;
begin
  select * into v_game from codenames_games where room_id = p_room_id;
  if v_game.room_id is null or v_game.phase <> 'guessing' then
    raise exception 'not the guessing phase';
  end if;
  if my_codenames_team(p_room_id) <> v_game.current_team or is_codenames_spymaster(p_room_id) then
    raise exception 'only an operative on the current team can pass';
  end if;

  v_next_team := case when v_game.current_team = 'red' then 'blue' else 'red' end;

  update codenames_games
    set current_team = v_next_team, phase = 'clue', clue_word = null, clue_number = null, guesses_remaining = 0, updated_at = now()
    where room_id = p_room_id;
end;
$$;

grant execute on function codenames_pass_turn(uuid) to authenticated;
