-- Gedeelde spelstart: alleen de maker/spelleider kan een sessie starten.
-- Uitvoeren in Supabase > SQL Editor.

create or replace function public.start_game(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  started_game public.games;
begin
  if auth.uid() is null then
    raise exception 'Je moet eerst anoniem inloggen.';
  end if;

  select * into started_game
  from public.games
  where id = p_game_id;

  if started_game.id is null then
    raise exception 'Deze sessie bestaat niet.';
  end if;

  if started_game.created_by <> auth.uid() then
    raise exception 'Alleen de spelleider kan het spel starten.';
  end if;

  if started_game.status = 'playing' then
    return started_game;
  end if;

  if started_game.status = 'ended' then
    raise exception 'Dit spel is al afgelopen.';
  end if;

  update public.games
  set status = 'playing',
      start_at = now(),
      ends_at = now() + make_interval(mins => duration_minutes::integer)
  where id = p_game_id
  returning * into started_game;

  return started_game;
end;
$$;

create or replace function public.get_game_state(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_game public.games;
begin
  if auth.uid() is null then
    raise exception 'Je moet eerst anoniem inloggen.';
  end if;

  if not exists (
    select 1 from public.players
    where game_id = p_game_id
      and user_id = auth.uid()
  ) then
    raise exception 'Je bent geen deelnemer van deze sessie.';
  end if;

  select * into selected_game
  from public.games
  where id = p_game_id;

  return selected_game;
end;
$$;

revoke all on function public.start_game(uuid) from public;
revoke all on function public.get_game_state(uuid) from public;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.get_game_state(uuid) to authenticated;
