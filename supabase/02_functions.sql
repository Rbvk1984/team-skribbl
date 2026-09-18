-- =========================================================
-- Team Skribbl — Server-side functions
--
-- These are plain Postgres functions (SECURITY DEFINER), not
-- Supabase Edge Functions. They run with elevated privilege
-- INSIDE the database, so they can check secrets like passcode
-- hashes or the round's hidden word without ever exposing the
-- raw value to the browser. This avoids needing to deploy and
-- pay-attention-to a separate Edge Function runtime for logic
-- that Postgres can already do safely — see ARCHITECTURE.md
-- section "Why not Edge Functions" for the reasoning.
-- =========================================================

-- ---------- Access-control helpers, used inside RLS policies ----------

create or replace function has_active_access()
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from player_access pa
    join access_codes ac on ac.id = pa.access_code_id
    where pa.user_id = auth.uid()
      and ac.active = true
  );
$$;

create or replace function is_admin_user()
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from player_access pa
    join access_codes ac on ac.id = pa.access_code_id
    where pa.user_id = auth.uid()
      and ac.active = true
      and ac.is_admin = true
  );
$$;

create or replace function is_in_room(p_room_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

create or replace function is_room_host(p_room_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from rooms
    where id = p_room_id and host_user_id = auth.uid()
  );
$$;

-- ---------- Passcode redemption (replaces "login") ----------
-- Client flow: supabase.auth.signInAnonymously() -> rpc('redeem_access_code', {p_code})

create or replace function redeem_access_code(p_code text)
returns table(success boolean, is_admin boolean, label text)
language plpgsql security definer
as $$
declare
  v_hash text := encode(digest(p_code, 'sha256'), 'hex');
  v_row  access_codes;
begin
  if auth.uid() is null then
    return query select false, false, null::text;
    return;
  end if;

  select * into v_row from access_codes
    where code_hash = v_hash and active = true
    limit 1;

  if v_row.id is null then
    return query select false, false, null::text;
    return;
  end if;

  insert into player_access (user_id, access_code_id)
  values (auth.uid(), v_row.id)
  on conflict (user_id) do update
    set access_code_id = excluded.access_code_id,
        redeemed_at = now();

  return query select true, v_row.is_admin, v_row.label;
end;
$$;

grant execute on function redeem_access_code(text) to anon, authenticated;

-- ---------- Admin management of access codes ----------
-- The plaintext code is only ever seen by the admin, once, at creation time.

create or replace function admin_create_access_code(p_label text, p_code text, p_is_admin boolean default false)
returns uuid
language plpgsql security definer
as $$
declare
  v_id uuid;
begin
  if not is_admin_user() then
    raise exception 'not authorized';
  end if;

  insert into access_codes (label, code_hash, is_admin, created_by)
  values (p_label, encode(digest(p_code, 'sha256'), 'hex'), p_is_admin, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function admin_create_access_code(text, text, boolean) to authenticated;

create or replace function admin_set_code_active(p_access_code_id uuid, p_active boolean)
returns void
language plpgsql security definer
as $$
begin
  if not is_admin_user() then
    raise exception 'not authorized';
  end if;

  update access_codes set active = p_active where id = p_access_code_id;
end;
$$;

grant execute on function admin_set_code_active(uuid, boolean) to authenticated;

create or replace function admin_list_access_codes()
returns table(id uuid, label text, is_admin boolean, active boolean, created_at timestamptz, redeemed boolean)
language plpgsql security definer
as $$
begin
  if not is_admin_user() then
    raise exception 'not authorized';
  end if;

  return query
    select ac.id, ac.label, ac.is_admin, ac.active, ac.created_at,
           exists(select 1 from player_access pa where pa.access_code_id = ac.id) as redeemed
    from access_codes ac
    order by ac.created_at desc;
end;
$$;

grant execute on function admin_list_access_codes() to authenticated;

-- ---------- Gameplay: word choices for the drawer ----------

create or replace function get_word_choices()
returns table(word text)
language sql stable security definer
as $$
  select word from words where active = true order by random() limit 3;
$$;

grant execute on function get_word_choices() to authenticated;

-- ---------- Gameplay: secure guess checking + scoring ----------
-- The word is never sent to non-drawer clients. Guesses are checked
-- here, server-side, against rounds.selected_word.

create or replace function submit_guess(p_round_id uuid, p_guess text)
returns table(correct boolean, points_awarded int)
language plpgsql security definer
as $$
declare
  v_round        rounds;
  v_player_id    uuid;
  v_already      boolean;
  v_seconds_left numeric;
  v_points       int;
begin
  select id into v_player_id from players
    where user_id = auth.uid()
      and room_id = (select room_id from rounds where id = p_round_id);

  if v_player_id is null then
    raise exception 'not a player in this room';
  end if;

  select * into v_round from rounds where id = p_round_id;

  if v_round.status <> 'drawing' then
    return query select false, 0;
    return;
  end if;

  if v_round.drawer_player_id = v_player_id then
    raise exception 'drawer cannot guess';
  end if;

  select exists(
    select 1 from guesses
    where round_id = p_round_id and player_id = v_player_id and correct = true
  ) into v_already;

  if v_already then
    return query select true, 0;   -- already scored this round, no double dipping
    return;
  end if;

  if lower(trim(p_guess)) = lower(trim(v_round.selected_word)) then
    v_seconds_left := greatest(extract(epoch from (v_round.ends_at - now())), 0);
    -- base 50 points + up to 50 bonus for guessing quickly
    v_points := 50 + floor(50 * (v_seconds_left / greatest(extract(epoch from (v_round.ends_at - v_round.started_at)), 1)))::int;

    insert into guesses (round_id, player_id, guess_text, correct, points_awarded)
    values (p_round_id, v_player_id, p_guess, true, v_points);

    update players set score = score + v_points where id = v_player_id;
    -- small reward to the drawer for a successful guess
    update players set score = score + 10 where id = v_round.drawer_player_id;

    return query select true, v_points;
  else
    insert into guesses (round_id, player_id, guess_text, correct, points_awarded)
    values (p_round_id, v_player_id, p_guess, false, 0);

    return query select false, 0;
  end if;
end;
$$;

grant execute on function submit_guess(uuid, text) to authenticated;
