-- Vrij tekenen van het speelgebied op de kaart.
-- Uitvoeren in Supabase > SQL Editor.

alter table public.games
add column if not exists play_area jsonb;

create or replace function public.set_play_area(
  p_game_id uuid,
  p_area jsonb
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

  if jsonb_typeof(p_area) <> 'array' or jsonb_array_length(p_area) < 3 then
    raise exception 'Een speelgebied heeft minimaal drie punten nodig.';
  end if;

  update public.games
  set play_area = p_area
  where id = p_game_id
    and created_by = auth.uid()
    and status = 'lobby'
  returning * into updated_game;

  if updated_game.id is null then
    raise exception 'Alleen de spelleider kan het speelgebied wijzigen voordat het spel start.';
  end if;

  return updated_game;
end;
$$;

revoke all on function public.set_play_area(uuid, jsonb) from public;
grant execute on function public.set_play_area(uuid, jsonb) to authenticated;
