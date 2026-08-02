-- Foto-hints voor boeven, elke 5 minuten.
-- Uitvoeren in Supabase > SQL Editor.

create table if not exists public.game_hints (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  image_path text not null,
  created_at timestamptz not null default now(),
  unique (game_id, player_id, round_number)
);

create index if not exists game_hints_game_created_idx
on public.game_hints(game_id, created_at desc);

alter table public.game_hints enable row level security;

create policy "Game members can view hints"
on public.game_hints for select
to authenticated
using (
  exists (
    select 1 from public.players as membership
    where membership.game_id = game_hints.game_id
      and membership.user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public)
values ('game-hints', 'game-hints', false)
on conflict (id) do nothing;

drop policy if exists "Game members can upload hint photos" on storage.objects;
create policy "Game members can upload hint photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'game-hints'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and exists (
    select 1 from public.players
    where players.game_id = (storage.foldername(name))[1]::uuid
      and players.user_id = (select auth.uid())
      and players.role = 'boef'
  )
);

drop policy if exists "Game members can read hint photos" on storage.objects;
create policy "Game members can read hint photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'game-hints'
  and exists (
    select 1 from public.players
    where players.game_id = (storage.foldername(name))[1]::uuid
      and players.user_id = (select auth.uid())
  )
);

create or replace function public.submit_hint(
  p_game_id uuid,
  p_image_path text
)
returns public.game_hints
language plpgsql
security definer
set search_path = public
as $$
declare
  current_game public.games;
  current_player public.players;
  hint_round integer;
  new_hint public.game_hints;
begin
  if auth.uid() is null then
    raise exception 'Je moet eerst anoniem inloggen.';
  end if;

  select * into current_game
  from public.games
  where id = p_game_id
    and status = 'playing';

  if current_game.id is null then
    raise exception 'Dit spel is niet actief.';
  end if;

  select * into current_player
  from public.players
  where game_id = p_game_id
    and user_id = auth.uid()
    and role = 'boef';

  if current_player.id is null then
    raise exception 'Alleen boeven kunnen een foto-hint plaatsen.';
  end if;

  if p_image_path not like p_game_id::text || '/' || auth.uid()::text || '/%' then
    raise exception 'Ongeldig fotopad.';
  end if;

  hint_round := floor(extract(epoch from now() - current_game.start_at) / 300)::integer;
  if hint_round < 1 then
    raise exception 'De eerste foto-hint is pas na vijf minuten nodig.';
  end if;

  insert into public.game_hints (game_id, player_id, round_number, image_path)
  values (p_game_id, current_player.id, hint_round, p_image_path)
  returning * into new_hint;

  return new_hint;
end;
$$;

revoke all on function public.submit_hint(uuid, text) from public;
grant execute on function public.submit_hint(uuid, text) to authenticated;
