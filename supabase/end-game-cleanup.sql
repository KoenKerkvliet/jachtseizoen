-- Beëindig een sessie en ruim foto-hints veilig op via de Storage API.
-- Uitvoeren in Supabase > SQL Editor.

drop policy if exists "Game members can delete ended hint photos" on storage.objects;
create policy "Game members can delete ended hint photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'game-hints'
  and exists (
    select 1
    from public.games
    join public.players on players.game_id = games.id
    where games.id = (storage.foldername(name))[1]::uuid
      and games.status = 'ended'
      and players.user_id = (select auth.uid())
  )
);

create or replace function public.end_game(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  ended_game public.games;
begin
  if auth.uid() is null then
    raise exception 'Je moet eerst anoniem inloggen.';
  end if;

  select * into ended_game from public.games where id = p_game_id;
  if ended_game.id is null then
    raise exception 'Deze sessie bestaat niet.';
  end if;

  if ended_game.created_by <> auth.uid()
     and (ended_game.ends_at is null or now() < ended_game.ends_at) then
    raise exception 'Alleen de spelleider kan het spel vroeg stoppen.';
  end if;

  update public.games
  set status = 'ended'
  where id = p_game_id
  returning * into ended_game;

  delete from public.game_hints where game_id = p_game_id;

  return ended_game;
end;
$$;

revoke all on function public.end_game(uuid) from public;
grant execute on function public.end_game(uuid) to authenticated;
