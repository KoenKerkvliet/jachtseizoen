-- Herstel voor sessiecodes op projecten waar gen_random_bytes niet beschikbaar is.
-- Uitvoeren in Supabase > SQL Editor.

create or replace function public.create_game(
  p_title text,
  p_duration_minutes smallint,
  p_display_name text,
  p_role text
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  new_game public.games;
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'Je moet eerst anoniem inloggen.';
  end if;

  if p_role not in ('boef', 'vanger', 'leider') then
    raise exception 'Ongeldige rol.';
  end if;

  loop
    new_code := upper(substring(md5(random()::text || clock_timestamp()::text || auth.uid()::text) from 1 for 4));
    exit when not exists (select 1 from public.games where join_code = new_code);
  end loop;

  insert into public.games (created_by, title, join_code, duration_minutes)
  values (auth.uid(), trim(p_title), new_code, p_duration_minutes)
  returning * into new_game;

  insert into public.players (game_id, user_id, display_name, role)
  values (new_game.id, auth.uid(), trim(p_display_name), p_role);

  return new_game;
end;
$$;

revoke all on function public.create_game(text, smallint, text, text) from public;
grant execute on function public.create_game(text, smallint, text, text) to authenticated;
