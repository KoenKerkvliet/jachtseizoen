-- Herstel voor de deelnemerslijst: voorkomt een RLS-recursie.
-- Uitvoeren in Supabase > SQL Editor.

create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.players
    where game_id = p_game_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_game_member(uuid) from public;
grant execute on function public.is_game_member(uuid) to authenticated;

drop policy if exists "Game members can read fellow players" on public.players;
create policy "Game members can read fellow players"
on public.players for select
to authenticated
using (public.is_game_member(game_id));

drop policy if exists "Game members can read their game" on public.games;
create policy "Game members can read their game"
on public.games for select
to authenticated
using (public.is_game_member(id));

drop policy if exists "Game members can view hints" on public.game_hints;
create policy "Game members can view hints"
on public.game_hints for select
to authenticated
using (public.is_game_member(game_id));
