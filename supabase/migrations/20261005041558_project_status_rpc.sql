
create or replace function public.update_project_status(
  p_project_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean := false;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_status not in ('idea','planning','active','paused','completed','archived') then
    raise exception 'Invalid project status';
  end if;

  select exists(
    select 1
    from public.projects p
    where p.id=p_project_id and (
      p.owner_id=v_user
      or exists (
        select 1 from public.project_members pm
        where pm.project_id=p_project_id
          and pm.user_id=v_user
          and pm.status='active'
          and pm.role='maintainer'
      )
    )
  ) into v_allowed;

  if not v_allowed then raise exception 'Project management access required'; end if;

  update public.projects set status=p_status,updated_at=now() where id=p_project_id;
end;
$$;
revoke all on function public.update_project_status(uuid,text) from public,anon;
grant execute on function public.update_project_status(uuid,text) to authenticated;
