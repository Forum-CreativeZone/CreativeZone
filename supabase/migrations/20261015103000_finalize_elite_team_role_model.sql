alter table public.creative_team_members drop constraint if exists creative_team_members_role_check;
alter table public.creative_team_members add constraint creative_team_members_role_check
  check (role = any (array['owner','lead','maintainer','developer','reviewer','designer','member','viewer']::text[]));

alter table public.creative_team_invites drop constraint if exists creative_team_invites_role_check;
alter table public.creative_team_invites add constraint creative_team_invites_role_check
  check (role = any (array['lead','maintainer','developer','reviewer','designer','member','viewer']::text[]));

create or replace function private.current_user_can_manage_team_topics(p_team_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select private.current_user_is_system_owner()
    or coalesce(exists(
      select 1
      from public.creative_team_members m
      where m.team_id=p_team_id
        and m.user_id=(select auth.uid())
        and m.status='active'
        and m.role in ('owner','lead','maintainer')
    ),false)
$$;

create or replace function private.current_user_can_contribute_team(p_team_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select private.current_user_is_system_owner()
    or coalesce(exists(
      select 1
      from public.creative_team_members m
      where m.team_id=p_team_id
        and m.user_id=(select auth.uid())
        and m.status='active'
        and m.role in ('owner','lead','maintainer','developer','reviewer','designer','member')
    ),false)
$$;

revoke all on function private.current_user_can_manage_team_topics(uuid) from public;
revoke all on function private.current_user_can_contribute_team(uuid) from public;
grant execute on function private.current_user_can_manage_team_topics(uuid) to authenticated;
grant execute on function private.current_user_can_contribute_team(uuid) to authenticated;
