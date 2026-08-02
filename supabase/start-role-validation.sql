-- Start alleen toestaan wanneer minstens één boef én één vanger deelnemen.
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

  if not exists (
    select 1 from public.players
    where game_id = p_game_id and role = 'boef'
  ) or not exists (
    select 1 from public.players
    where game_id = p_game_id and role = 'vanger'
  ) then
    raise exception 'Er is minimaal één boef én één vanger nodig.';
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

revoke all on function public.start_game(uuid) from public;
grant execute on function public.start_game(uuid) to authenticated;
