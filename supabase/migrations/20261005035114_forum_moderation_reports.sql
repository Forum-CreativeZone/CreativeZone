alter table private.notification_email_queue enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on private.notification_email_queue from public, anon, authenticated;

create table if not exists public.reports (
  id uuid primary key default extensions.uuid_generate_v4(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('topic','post','profile','project')),
  target_id uuid not null,
  reason text not null check (reason in ('spam','abuse','harassment','misinformation','illegal','privacy','other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  resolution_note text not null default '' check (char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists reports_one_open_per_target_idx
on public.reports(reporter_id,target_type,target_id)
where status in ('pending','reviewing');
create index if not exists reports_status_created_idx on public.reports(status,created_at desc);
create index if not exists reports_target_idx on public.reports(target_type,target_id);
alter table public.reports enable row level security;

drop policy if exists "reporters read own reports" on public.reports;
create policy "reporters read own reports"
on public.reports for select to authenticated
using (
  reporter_id=(select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role in ('moderator','admin')
  )
);

create table if not exists public.moderation_actions (
  id uuid primary key default extensions.uuid_generate_v4(),
  moderator_id uuid references public.profiles(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  action_type text not null,
  target_type text not null,
  target_id uuid,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_created_idx on public.moderation_actions(created_at desc);
alter table public.moderation_actions enable row level security;

drop policy if exists "staff read moderation actions" on public.moderation_actions;
create policy "staff read moderation actions"
on public.moderation_actions for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role in ('moderator','admin')
  )
);

create or replace function public.create_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_exists boolean := false;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_target_type not in ('topic','post','profile','project') then raise exception 'Invalid report target'; end if;
  if p_reason not in ('spam','abuse','harassment','misinformation','illegal','privacy','other') then raise exception 'Invalid report reason'; end if;
  if char_length(coalesce(p_details,'')) > 2000 then raise exception 'Report details too long'; end if;

  if p_target_type='topic' then
    select exists(select 1 from public.topics where id=p_target_id) into v_exists;
  elsif p_target_type='post' then
    select exists(select 1 from public.posts where id=p_target_id) into v_exists;
  elsif p_target_type='profile' then
    select exists(select 1 from public.profiles where id=p_target_id) into v_exists;
  elsif p_target_type='project' then
    select exists(select 1 from public.projects where id=p_target_id) into v_exists;
  end if;
  if not v_exists then raise exception 'Report target not found'; end if;

  insert into public.reports(reporter_id,target_type,target_id,reason,details)
  values(v_user,p_target_type,p_target_id,p_reason,coalesce(p_details,''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_report(text,uuid,text,text) from public,anon;
grant execute on function public.create_report(text,uuid,text,text) to authenticated;

create or replace function public.review_report(
  p_report_id uuid,
  p_status text,
  p_resolution_note text default ''
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_report public.reports%rowtype;
begin
  select role into v_role from public.profiles where id=v_user;
  if v_user is null or v_role not in ('moderator','admin') then raise exception 'Staff access required'; end if;
  if p_status not in ('reviewing','resolved','dismissed') then raise exception 'Invalid report status'; end if;

  select * into v_report from public.reports where id=p_report_id for update;
  if not found then raise exception 'Report not found'; end if;

  update public.reports
  set status=p_status,
      reviewed_by=v_user,
      reviewed_at=case when p_status in ('resolved','dismissed') then now() else reviewed_at end,
      resolution_note=coalesce(p_resolution_note,'')
  where id=p_report_id;

  insert into public.moderation_actions(moderator_id,report_id,action_type,target_type,target_id,reason)
  values(v_user,p_report_id,'report_'||p_status,v_report.target_type,v_report.target_id,coalesce(p_resolution_note,''));
end;
$$;
revoke all on function public.review_report(uuid,text,text) from public,anon;
grant execute on function public.review_report(uuid,text,text) to authenticated;

create or replace function public.moderate_topic(
  p_topic_id uuid,
  p_action text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
begin
  select role into v_role from public.profiles where id=v_user;
  if v_user is null or v_role not in ('moderator','admin') then raise exception 'Staff access required'; end if;

  if p_action='lock' then
    update public.topics set locked=true where id=p_topic_id;
  elsif p_action='unlock' then
    update public.topics set locked=false where id=p_topic_id;
  elsif p_action='pin' then
    update public.topics set pinned=true where id=p_topic_id;
  elsif p_action='unpin' then
    update public.topics set pinned=false where id=p_topic_id;
  elsif p_action='delete' then
    if v_role <> 'admin' then raise exception 'Admin access required for deletion'; end if;
    delete from public.topics where id=p_topic_id;
  else
    raise exception 'Invalid moderation action';
  end if;

  insert into public.moderation_actions(moderator_id,action_type,target_type,target_id,reason)
  values(v_user,p_action,'topic',p_topic_id,coalesce(p_reason,''));
end;
$$;
revoke all on function public.moderate_topic(uuid,text,text) from public,anon;
grant execute on function public.moderate_topic(uuid,text,text) to authenticated;

create or replace function public.moderate_post(
  p_post_id uuid,
  p_action text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
begin
  select role into v_role from public.profiles where id=v_user;
  if v_user is null or v_role not in ('moderator','admin') then raise exception 'Staff access required'; end if;
  if p_action <> 'delete' then raise exception 'Invalid moderation action'; end if;

  delete from public.posts where id=p_post_id;
  insert into public.moderation_actions(moderator_id,action_type,target_type,target_id,reason)
  values(v_user,'delete','post',p_post_id,coalesce(p_reason,''));
end;
$$;
revoke all on function public.moderate_post(uuid,text,text) from public,anon;
grant execute on function public.moderate_post(uuid,text,text) to authenticated;

grant select on public.reports to authenticated;
grant select on public.moderation_actions to authenticated;
