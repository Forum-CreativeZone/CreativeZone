
create or replace function public.request_project_participation(
  p_project_id uuid,
  p_message text default ''
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if char_length(coalesce(p_message,'')) > 1000 then raise exception 'Message too long'; end if;

  select owner_id into v_owner
  from public.projects
  where id=p_project_id and status <> 'archived';

  if not found then raise exception 'Project not found'; end if;
  if v_owner=v_user then raise exception 'Project owner is already a member'; end if;

  insert into public.project_members(project_id,user_id,role,status,message,updated_at)
  values(p_project_id,v_user,'interested','pending',coalesce(p_message,''),now())
  on conflict(project_id,user_id) do update
  set role='interested',
      status='pending',
      message=excluded.message,
      updated_at=now()
  where public.project_members.role <> 'owner'
    and public.project_members.status in ('declined','left');
end;
$$;
revoke all on function public.request_project_participation(uuid,text) from public,anon;
grant execute on function public.request_project_participation(uuid,text) to authenticated;
