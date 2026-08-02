-- Instelbare foto-opdrachten en gezamenlijke boefharten.
-- Uitvoeren in Supabase > SQL Editor.

alter table public.games
add column if not exists hint_interval_minutes smallint not null default 7 check (hint_interval_minutes between 3 and 15),
add column if not exists boef_health_quarters smallint not null default 12 check (boef_health_quarters between 0 and 12),
add column if not exists health_updated_at timestamptz;

create or replace function public.create_game(
  p_title text,
  p_duration_minutes smallint,
  p_display_name text,
  p_role text,
  p_hint_interval_minutes smallint default 7
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare new_game public.games; new_code text;
begin
  if auth.uid() is null then raise exception 'Je moet eerst anoniem inloggen.'; end if;
  if p_role not in ('boef', 'vanger') then raise exception 'Ongeldige rol.'; end if;
  if p_hint_interval_minutes not between 3 and 15 then raise exception 'Ongeldig foto-interval.'; end if;
  loop
    new_code := upper(substring(md5(random()::text || clock_timestamp()::text || auth.uid()::text) from 1 for 4));
    exit when not exists (select 1 from public.games where join_code = new_code);
  end loop;
  insert into public.games (created_by,title,join_code,duration_minutes,hint_interval_minutes)
  values (auth.uid(),trim(p_title),new_code,p_duration_minutes,p_hint_interval_minutes)
  returning * into new_game;
  insert into public.players (game_id,user_id,display_name,role)
  values (new_game.id,auth.uid(),trim(p_display_name),p_role);
  return new_game;
end;
$$;

create or replace function public.sync_game_health(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare g public.games; elapsed_seconds numeric; units integer; required_round integer; overdue boolean;
begin
  select * into g from public.games where id=p_game_id;
  if g.id is null or g.status <> 'playing' then return g; end if;

  required_round := floor(extract(epoch from now() - g.start_at) / (g.hint_interval_minutes * 60))::integer;
  overdue := required_round >= 1 and exists (
    select 1 from public.players b
    where b.game_id=g.id and b.role='boef'
      and not exists (
        select 1 from public.game_hints h
        where h.game_id=g.id and h.player_id=b.id and h.round_number=required_round
      )
  );

  elapsed_seconds := extract(epoch from now() - coalesce(g.health_updated_at, g.start_at));
  if overdue then
    units := floor(elapsed_seconds / 30)::integer;
    if units > 0 then
      update public.games set boef_health_quarters=greatest(0,boef_health_quarters-units),
        health_updated_at=now()
      where id=g.id returning * into g;
    end if;
  else
    units := floor(elapsed_seconds / 60)::integer;
    if units > 0 then
      update public.games set boef_health_quarters=least(12,boef_health_quarters+units),
        health_updated_at=now()
      where id=g.id returning * into g;
    end if;
  end if;

  if g.boef_health_quarters <= 0 then
    update public.games set status='ended' where id=g.id returning * into g;
  end if;
  return g;
end;
$$;

revoke all on function public.create_game(text,smallint,text,text,smallint) from public;
grant execute on function public.create_game(text,smallint,text,text,smallint) to authenticated;
revoke all on function public.sync_game_health(uuid) from public;
grant execute on function public.sync_game_health(uuid) to authenticated;
