-- Eerste veilige databasebasis voor Jachtseizoen.
-- Vereist Supabase Anonymous Sign-Ins (Auth > Providers > Anonymous).

create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 40),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{4}$'),
  duration_minutes smallint not null check (duration_minutes between 15 and 180),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'ended')),
  start_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 20),
  role text not null check (role in ('boef', 'vanger', 'leider')),
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create index if not exists players_game_id_idx on public.players(game_id);
create index if not exists players_user_id_idx on public.players(user_id);

alter table public.games enable row level security;
alter table public.players enable row level security;

create policy "Game members can read their game"
on public.games for select
to authenticated
using (
  exists (
    select 1 from public.players
    where players.game_id = games.id
      and players.user_id = (select auth.uid())
  )
);

create policy "Game members can read fellow players"
on public.players for select
to authenticated
using (
  exists (
    select 1 from public.players as membership
    where membership.game_id = players.game_id
      and membership.user_id = (select auth.uid())
  )
);

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
    new_code := upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 4));
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

create or replace function public.join_game(
  p_join_code text,
  p_display_name text,
  p_role text
)
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

  if p_role not in ('boef', 'vanger', 'leider') then
    raise exception 'Ongeldige rol.';
  end if;

  select * into selected_game
  from public.games
  where join_code = upper(trim(p_join_code))
    and status in ('lobby', 'playing');

  if selected_game.id is null then
    raise exception 'Deze sessie bestaat niet of is al afgelopen.';
  end if;

  insert into public.players (game_id, user_id, display_name, role)
  values (selected_game.id, auth.uid(), trim(p_display_name), p_role)
  on conflict (game_id, user_id)
  do update set display_name = excluded.display_name, role = excluded.role;

  return selected_game;
end;
$$;

revoke all on function public.create_game(text, smallint, text, text) from public;
revoke all on function public.join_game(text, text, text) from public;
grant execute on function public.create_game(text, smallint, text, text) to authenticated;
grant execute on function public.join_game(text, text, text) to authenticated;
