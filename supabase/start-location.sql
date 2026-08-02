-- Startadres en kaartfocus.
-- Uitvoeren in Supabase > SQL Editor.

alter table public.games
add column if not exists start_address text,
add column if not exists start_lat double precision,
add column if not exists start_lng double precision;

create or replace function public.set_start_location(
  p_game_id uuid,
  p_address text,
  p_lat double precision,
  p_lng double precision
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_game public.games;
begin
  if auth.uid() is null then
    raise exception 'Je moet eerst anoniem inloggen.';
  end if;

  update public.games
  set start_address = trim(p_address),
      start_lat = p_lat,
      start_lng = p_lng
  where id = p_game_id
    and created_by = auth.uid()
    and status = 'lobby'
  returning * into updated_game;

  if updated_game.id is null then
    raise exception 'Alleen de spelleider kan de startlocatie instellen.';
  end if;

  return updated_game;
end;
$$;

revoke all on function public.set_start_location(uuid, text, double precision, double precision) from public;
grant execute on function public.set_start_location(uuid, text, double precision, double precision) to authenticated;
