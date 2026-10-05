-- CreativeZone Memberships, permanent owner privileges, cosmetics and historical badges.

alter table public.profiles
  add column if not exists system_owner boolean not null default false;

create table if not exists public.membership_plans (
  id text primary key,
  name text not null,
  description text not null default '',
  badge text not null default '',
  rank smallint not null unique check (rank between 0 and 10),
  entitlements jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.membership_plans enable row level security;

drop policy if exists "membership plans public read" on public.membership_plans;
create policy "membership plans public read"
on public.membership_plans for select
to anon, authenticated
using (active = true);

grant select on public.membership_plans to anon, authenticated;

insert into public.membership_plans(id,name,description,badge,rank,entitlements)
values
(
  'free',
  'CreativeZone Free',
  'Acesso completo à comunidade e aos recursos essenciais.',
  'FREE',
  0,
  jsonb_build_object(
    'name_color',false,
    'custom_title',false,
    'avatar_frame',false,
    'animated_cover',false,
    'featured_projects',3,
    'forum_upload_mb',10,
    'forum_upload_count',4,
    'history_days',30,
    'early_access',false,
    'elite_area',false,
    'creator_tools',false,
    'ads_free',false,
    'full_access',false
  )
),
(
  'pro',
  'CreativeZone Pro',
  'Personalização avançada e benefícios extras para membros ativos.',
  'PRO',
  1,
  jsonb_build_object(
    'name_color',true,
    'custom_title',true,
    'avatar_frame',true,
    'animated_cover',true,
    'featured_projects',5,
    'forum_upload_mb',25,
    'forum_upload_count',8,
    'history_days',365,
    'early_access',true,
    'elite_area',false,
    'creator_tools',false,
    'ads_free',true,
    'full_access',false
  )
),
(
  'elite',
  'CreativeZone Elite',
  'Todos os benefícios premium, personalização máxima e acesso Elite.',
  'ELITE',
  2,
  jsonb_build_object(
    'name_color',true,
    'custom_title',true,
    'avatar_frame',true,
    'animated_cover',true,
    'featured_projects',10,
    'forum_upload_mb',100,
    'forum_upload_count',20,
    'history_days',-1,
    'early_access',true,
    'elite_area',true,
    'creator_tools',true,
    'ads_free',true,
    'full_access',false
  )
)
on conflict(id) do update
set name=excluded.name,
    description=excluded.description,
    badge=excluded.badge,
    rank=excluded.rank,
    entitlements=excluded.entitlements,
    active=true,
    updated_at=now();

create table if not exists public.user_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan_id text not null references public.membership_plans(id),
  status text not null default 'active'
    check (status in ('active','cancelled','expired','past_due')),
  permanent boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  source text not null default 'admin'
    check (source in ('admin','payment','promo','system')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_memberships_expiry_check
    check (permanent = true or ends_at is null or ends_at > starts_at)
);

alter table public.user_memberships enable row level security;

drop policy if exists "memberships public read" on public.user_memberships;
create policy "memberships public read"
on public.user_memberships for select
to anon, authenticated
using (true);

drop policy if exists "admins insert memberships" on public.user_memberships;
create policy "admins insert memberships"
on public.user_memberships for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles actor
    where actor.id=(select auth.uid())
      and actor.role='admin'
  )
  and (
    not exists (
      select 1 from public.profiles target
      where target.id=user_memberships.user_id
        and target.system_owner=true
    )
    or user_memberships.user_id=(select auth.uid())
  )
);

drop policy if exists "admins update memberships" on public.user_memberships;
create policy "admins update memberships"
on public.user_memberships for update
to authenticated
using (
  exists (
    select 1 from public.profiles actor
    where actor.id=(select auth.uid())
      and actor.role='admin'
  )
  and (
    not exists (
      select 1 from public.profiles target
      where target.id=user_memberships.user_id
        and target.system_owner=true
    )
    or user_memberships.user_id=(select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles actor
    where actor.id=(select auth.uid())
      and actor.role='admin'
  )
);

drop policy if exists "admins delete memberships" on public.user_memberships;
create policy "admins delete memberships"
on public.user_memberships for delete
to authenticated
using (
  exists (
    select 1 from public.profiles actor
    where actor.id=(select auth.uid())
      and actor.role='admin'
  )
  and not exists (
    select 1 from public.profiles target
    where target.id=user_memberships.user_id
      and target.system_owner=true
  )
);

grant select on public.user_memberships to anon, authenticated;
grant insert, update, delete on public.user_memberships to authenticated;

create index if not exists user_memberships_plan_status_idx
  on public.user_memberships(plan_id,status,ends_at);

create table if not exists public.profile_cosmetics (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  name_color text,
  profile_title text,
  avatar_frame text not null default 'none',
  cover_effect text not null default 'none',
  badge_style text not null default 'default',
  updated_at timestamptz not null default now(),
  constraint profile_cosmetics_name_color_check
    check (name_color is null or name_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint profile_cosmetics_title_length
    check (profile_title is null or char_length(profile_title) <= 40),
  constraint profile_cosmetics_avatar_frame_check
    check (avatar_frame in ('none','pro','elite','architect')),
  constraint profile_cosmetics_cover_effect_check
    check (cover_effect in ('none','subtle','elite','architect')),
  constraint profile_cosmetics_badge_style_check
    check (badge_style in ('default','pro','elite','architect'))
);

alter table public.profile_cosmetics enable row level security;

drop policy if exists "profile cosmetics public read" on public.profile_cosmetics;
create policy "profile cosmetics public read"
on public.profile_cosmetics for select
to anon, authenticated
using (true);

drop policy if exists "users insert own cosmetics" on public.profile_cosmetics;
create policy "users insert own cosmetics"
on public.profile_cosmetics for insert
to authenticated
with check (user_id=(select auth.uid()));

drop policy if exists "users update own cosmetics" on public.profile_cosmetics;
create policy "users update own cosmetics"
on public.profile_cosmetics for update
to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

grant select on public.profile_cosmetics to anon, authenticated;
grant insert, update on public.profile_cosmetics to authenticated;

create table if not exists public.membership_upgrade_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.membership_plans(id),
  message text not null default '',
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint membership_upgrade_request_message_length
    check (char_length(message) <= 1000),
  constraint membership_upgrade_request_paid_plan
    check (plan_id in ('pro','elite'))
);

alter table public.membership_upgrade_requests enable row level security;

drop policy if exists "users read own membership requests" on public.membership_upgrade_requests;
create policy "users read own membership requests"
on public.membership_upgrade_requests for select
to authenticated
using (
  user_id=(select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
);

drop policy if exists "users create membership requests" on public.membership_upgrade_requests;
create policy "users create membership requests"
on public.membership_upgrade_requests for insert
to authenticated
with check (
  user_id=(select auth.uid())
  and status='pending'
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists "admins review membership requests" on public.membership_upgrade_requests;
create policy "admins review membership requests"
on public.membership_upgrade_requests for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
);

grant select on public.membership_upgrade_requests to authenticated;
grant insert(user_id,plan_id,message) on public.membership_upgrade_requests to authenticated;
grant update(status,reviewed_by,reviewed_at) on public.membership_upgrade_requests to authenticated;

create unique index if not exists one_pending_membership_request_per_user
  on public.membership_upgrade_requests(user_id)
  where status='pending';
create index if not exists membership_upgrade_requests_status_created_idx
  on public.membership_upgrade_requests(status,created_at desc);
create index if not exists membership_upgrade_requests_plan_idx
  on public.membership_upgrade_requests(plan_id);

create or replace function private.is_system_owner(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select system_owner
    from public.profiles
    where id=p_user
  ),false);
$$;

revoke all on function private.is_system_owner(uuid) from public, anon, authenticated;

create or replace function private.membership_entitlements(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  select mp.entitlements
  into v_result
  from public.user_memberships um
  join public.membership_plans mp on mp.id=um.plan_id
  where um.user_id=p_user
    and um.status='active'
    and (um.permanent or um.ends_at is null or um.ends_at>now())
    and mp.active=true
  order by mp.rank desc
  limit 1;

  if v_result is null then
    select entitlements into v_result
    from public.membership_plans
    where id='free';
  end if;

  if private.is_system_owner(p_user) then
    v_result := v_result || jsonb_build_object(
      'full_access',true,
      'featured_projects',99,
      'forum_upload_mb',500,
      'forum_upload_count',50,
      'history_days',-1,
      'early_access',true,
      'elite_area',true,
      'creator_tools',true,
      'ads_free',true,
      'name_color',true,
      'custom_title',true,
      'avatar_frame',true,
      'animated_cover',true
    );
  end if;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

revoke all on function private.membership_entitlements(uuid) from public, anon, authenticated;

create or replace function public.get_membership_state(p_user_id uuid)
returns table(
  plan_id text,
  plan_name text,
  badge text,
  permanent boolean,
  ends_at timestamptz,
  entitlements jsonb,
  system_owner boolean
)
language sql
stable
security invoker
set search_path=''
as $$
  with target as (
    select p.id,p.system_owner
    from public.profiles p
    where p.id=p_user_id
  ),
  active_membership as (
    select um.plan_id,um.permanent,um.ends_at
    from public.user_memberships um
    where um.user_id=p_user_id
      and um.status='active'
      and (um.permanent or um.ends_at is null or um.ends_at>now())
    limit 1
  ),
  chosen as (
    select
      coalesce(am.plan_id,'free') as plan_id,
      coalesce(am.permanent,false) as permanent,
      am.ends_at,
      t.system_owner
    from target t
    left join active_membership am on true
  )
  select
    c.plan_id,
    mp.name,
    mp.badge,
    case when c.system_owner then true else c.permanent end,
    case when c.system_owner then null else c.ends_at end,
    case
      when c.system_owner then mp.entitlements || jsonb_build_object(
        'full_access',true,
        'featured_projects',99,
        'forum_upload_mb',500,
        'forum_upload_count',50,
        'history_days',-1,
        'early_access',true,
        'elite_area',true,
        'creator_tools',true,
        'ads_free',true,
        'name_color',true,
        'custom_title',true,
        'avatar_frame',true,
        'animated_cover',true
      )
      else mp.entitlements
    end,
    c.system_owner
  from chosen c
  join public.membership_plans mp on mp.id=c.plan_id;
$$;

revoke all on function public.get_membership_state(uuid) from public;
grant execute on function public.get_membership_state(uuid) to anon, authenticated, service_role;

create or replace function private.validate_profile_cosmetics()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan text := 'free';
  v_owner boolean := false;
begin
  select p.system_owner into v_owner
  from public.profiles p
  where p.id=new.user_id;

  if not coalesce(v_owner,false) then
    select um.plan_id into v_plan
    from public.user_memberships um
    where um.user_id=new.user_id
      and um.status='active'
      and (um.permanent or um.ends_at is null or um.ends_at>now())
    limit 1;

    v_plan := coalesce(v_plan,'free');

    if v_plan='free' then
      if new.name_color is not null
         or new.profile_title is not null
         or new.avatar_frame<>'none'
         or new.cover_effect<>'none'
         or new.badge_style<>'default' then
        raise exception 'Este recurso de personalização exige CreativeZone Pro ou Elite.';
      end if;
    elsif v_plan='pro' then
      if new.avatar_frame not in ('none','pro')
         or new.cover_effect not in ('none','subtle')
         or new.badge_style not in ('default','pro') then
        raise exception 'Esta personalização exige CreativeZone Elite.';
      end if;
    elsif v_plan='elite' then
      if new.avatar_frame='architect'
         or new.cover_effect='architect'
         or new.badge_style='architect' then
        raise exception 'A identidade Arquiteto CreativeZone é exclusiva do proprietário da plataforma.';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.validate_profile_cosmetics() from public, anon, authenticated;

drop trigger if exists validate_profile_cosmetics on public.profile_cosmetics;
create trigger validate_profile_cosmetics
before insert or update on public.profile_cosmetics
for each row execute function private.validate_profile_cosmetics();

create or replace function private.protect_system_owner_membership()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if private.is_system_owner(old.user_id) then
    if tg_op='DELETE' then
      raise exception 'A assinatura permanente do proprietário da CreativeZone não pode ser removida.';
    end if;

    new.plan_id := 'elite';
    new.status := 'active';
    new.permanent := true;
    new.ends_at := null;
    new.source := 'system';
    new.updated_at := now();
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function private.protect_system_owner_membership() from public, anon, authenticated;

drop trigger if exists protect_system_owner_membership on public.user_memberships;
create trigger protect_system_owner_membership
before update or delete on public.user_memberships
for each row execute function private.protect_system_owner_membership();

create or replace function private.membership_change_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' or
     old.plan_id is distinct from new.plan_id or
     old.status is distinct from new.status or
     old.permanent is distinct from new.permanent or
     old.ends_at is distinct from new.ends_at then
    insert into public.notifications(user_id,actor_id,type,data)
    values(
      new.user_id,
      coalesce(new.granted_by,new.user_id),
      'membership',
      jsonb_build_object(
        'plan_id',new.plan_id,
        'status',new.status,
        'permanent',new.permanent,
        'message',
          case
            when new.status='active' then 'Seu plano CreativeZone foi atualizado.'
            else 'O status da sua assinatura CreativeZone foi atualizado.'
          end,
        'path','/conta/assinatura'
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.membership_change_notification() from public, anon, authenticated;

drop trigger if exists membership_change_notification on public.user_memberships;
create trigger membership_change_notification
after insert or update on public.user_memberships
for each row execute function private.membership_change_notification();

create or replace function private.notify_staff_on_membership_request()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.notifications(user_id,actor_id,type,data)
  select
    p.id,
    new.user_id,
    'membership_request',
    jsonb_build_object(
      'request_id',new.id,
      'plan_id',new.plan_id,
      'message','Novo pedido de upgrade CreativeZone.',
      'path','/conta/assinatura'
    )
  from public.profiles p
  where p.role='admin' and p.account_status='active';

  return new;
end;
$$;

revoke all on function private.notify_staff_on_membership_request() from public, anon, authenticated;

drop trigger if exists notify_staff_on_membership_request on public.membership_upgrade_requests;
create trigger notify_staff_on_membership_request
after insert on public.membership_upgrade_requests
for each row execute function private.notify_staff_on_membership_request();

alter table public.profile_featured_projects
  drop constraint if exists profile_featured_projects_sort_order_check;

alter table public.profile_featured_projects
  add constraint profile_featured_projects_sort_order_check
  check (sort_order between 0 and 98);

create or replace function private.validate_featured_project_limit()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_limit integer;
begin
  v_limit := coalesce((private.membership_entitlements(new.user_id)->>'featured_projects')::integer,3);
  if new.sort_order < 0 or new.sort_order >= v_limit then
    raise exception 'Seu plano permite destacar até % projeto(s).',v_limit;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_featured_project_limit() from public, anon, authenticated;

drop trigger if exists validate_featured_project_limit on public.profile_featured_projects;
create trigger validate_featured_project_limit
before insert or update on public.profile_featured_projects
for each row execute function private.validate_featured_project_limit();

drop policy if exists "users feature projects" on public.profile_featured_projects;
create policy "users feature projects"
on public.profile_featured_projects for insert
to authenticated
with check (
  user_id=(select auth.uid())
  and (
    exists (
      select 1 from public.projects pr
      where pr.id=profile_featured_projects.project_id
        and pr.owner_id=(select auth.uid())
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id=profile_featured_projects.project_id
        and pm.user_id=(select auth.uid())
        and pm.status='active'
    )
  )
);

insert into public.badges(slug,name,description,icon,points)
values
  ('architect-creativezone','Arquiteto CreativeZone','Identidade exclusiva de quem idealizou e desenvolve a CreativeZone.','🏗️',0),
  ('beta-tester','Beta Tester','Participou ativamente dos testes da CreativeZone durante a fase beta.','🧪',0),
  ('pioneer-creativezone','Pioneiro CreativeZone','Esteve presente nos primeiros capítulos da comunidade CreativeZone.','🚀',0),
  ('early-supporter','Early Supporter','Apoiou a CreativeZone durante sua fase inicial.','💎',0)
on conflict(slug) do update
set name=excluded.name,
    description=excluded.description,
    icon=excluded.icon;

alter table public.reputation_events
  drop constraint if exists reputation_events_event_type_check;
alter table public.reputation_events
  add constraint reputation_events_event_type_check
  check (event_type in (
    'topic_created','reply_created','reaction_received','accepted_answer',
    'legacy_adjustment','system_grant'
  ));

alter table public.reputation_events
  drop constraint if exists reputation_events_points_check;
alter table public.reputation_events
  add constraint reputation_events_points_check
  check (points between -1000000 and 1000000);

create or replace function private.adjust_reputation_from_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid;
  v_total bigint;
begin
  v_user := case when tg_op='INSERT' then new.user_id else old.user_id end;

  select coalesce(sum(e.points),0)
  into v_total
  from public.reputation_events e
  where e.user_id=v_user;

  update public.profiles
  set reputation=least(1000000,greatest(0,v_total))::integer,
      updated_at=now()
  where id=v_user;

  perform private.award_gamification_badges(v_user);
  return coalesce(new,old);
end;
$$;

revoke all on function private.adjust_reputation_from_event() from public, anon, authenticated;

drop policy if exists "system owner maintain all projects" on public.projects;
create policy "system owner maintain all projects"
on public.projects for update
to authenticated
using (private.is_system_owner((select auth.uid())))
with check (private.is_system_owner((select auth.uid())));

drop policy if exists "system owner delete any project" on public.projects;
create policy "system owner delete any project"
on public.projects for delete
to authenticated
using (private.is_system_owner((select auth.uid())));

create or replace function public.review_project_member(
  p_project_id uuid,
  p_user_id uuid,
  p_status text,
  p_role text default 'contributor'
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
  if p_status not in ('active','declined') then raise exception 'Invalid membership status'; end if;
  if p_role not in ('maintainer','contributor') then raise exception 'Invalid membership role'; end if;

  if private.is_system_owner(v_user) then
    v_allowed := true;
  else
    select exists(
      select 1 from public.projects p
      where p.id=p_project_id and (
        p.owner_id=v_user
        or exists (
          select 1 from public.project_members pm
          where pm.project_id=p_project_id and pm.user_id=v_user
            and pm.status='active' and pm.role='maintainer'
        )
      )
    ) into v_allowed;
  end if;

  if not v_allowed then raise exception 'Project management access required'; end if;

  update public.project_members
  set status=p_status,
      role=case when p_status='active' then p_role else role end,
      updated_at=now()
  where project_id=p_project_id and user_id=p_user_id and role<>'owner';
end;
$$;

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

  if private.is_system_owner(v_user) then
    v_allowed := true;
  else
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
  end if;

  if not v_allowed then raise exception 'Project management access required'; end if;

  update public.projects set status=p_status,updated_at=now() where id=p_project_id;
end;
$$;

create or replace function public.moderate_chat_message(
  p_message_id uuid,
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
  v_target uuid;
  v_target_role text;
  v_target_owner boolean := false;
begin
  select role into v_role from public.profiles where id=v_user;
  if v_user is null or v_role not in ('moderator','admin') then
    raise exception 'Staff access required';
  end if;

  select m.user_id,p.role,p.system_owner
    into v_target,v_target_role,v_target_owner
  from public.chat_messages m
  join public.profiles p on p.id=m.user_id
  where m.id=p_message_id;

  if v_target is null then raise exception 'Mensagem não encontrada.'; end if;

  if v_target_owner and v_target<>v_user then
    raise exception 'A conta proprietária da CreativeZone não pode ser moderada por outro membro da equipe.';
  end if;

  if v_target_role='admin' and v_role <> 'admin' then
    raise exception 'Somente administradores podem moderar outro administrador.';
  end if;

  if p_action='delete' then
    update public.chat_messages
    set content='',
        deleted_at=coalesce(deleted_at,now()),
        deleted_by=v_user,
        updated_at=now()
    where id=p_message_id;

  elsif p_action in ('mute_10m','mute_1h','mute_24h') then
    insert into public.chat_mutes(user_id,muted_until,reason,moderator_id,updated_at)
    values(
      v_target,
      now() + case p_action
        when 'mute_10m' then interval '10 minutes'
        when 'mute_1h' then interval '1 hour'
        else interval '24 hours'
      end,
      left(coalesce(p_reason,''),1000),
      v_user,
      now()
    )
    on conflict(user_id) do update
    set muted_until=excluded.muted_until,
        reason=excluded.reason,
        moderator_id=excluded.moderator_id,
        updated_at=now();

  elsif p_action='unmute' then
    delete from public.chat_mutes where user_id=v_target;

  elsif p_action='ban' then
    insert into public.chat_bans(user_id,banned_until,reason,moderator_id,updated_at)
    values(v_target,null,left(coalesce(p_reason,''),1000),v_user,now())
    on conflict(user_id) do update
    set banned_until=null,
        reason=excluded.reason,
        moderator_id=excluded.moderator_id,
        updated_at=now();

  elsif p_action='unban' then
    delete from public.chat_bans where user_id=v_target;

  else
    raise exception 'Invalid moderation action';
  end if;

  insert into public.moderation_actions(
    moderator_id,action_type,target_type,target_id,reason
  )
  values(
    v_user,
    'chat_'||p_action,
    'chat_message',
    p_message_id,
    left(coalesce(p_reason,''),2000)
  );

  if p_action <> 'unmute' and p_action <> 'unban' then
    insert into public.notifications(user_id,actor_id,type,data)
    values(
      v_target,
      v_user,
      'moderation',
      jsonb_build_object(
        'message',
        case
          when p_action='delete' then 'Uma mensagem sua foi removida do Chat da Comunidade.'
          when p_action like 'mute_%' then 'Você foi silenciado temporariamente no Chat da Comunidade.'
          when p_action='ban' then 'Seu acesso ao Chat da Comunidade foi bloqueado.'
          else 'A moderação atualizou seu acesso ao Chat da Comunidade.'
        end,
        'path','/'
      )
    );
  end if;
end;
$$;

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
  v_target uuid;
begin
  select role into v_role from public.profiles where id=v_user;
  if v_user is null or v_role not in ('moderator','admin') then
    raise exception 'Staff access required';
  end if;
  if p_action <> 'delete' then raise exception 'Invalid moderation action'; end if;

  select author_id into v_target from public.posts where id=p_post_id;
  if private.is_system_owner(v_target) and v_target<>v_user then
    raise exception 'Conteúdo do proprietário da CreativeZone não pode ser removido por outro membro da equipe.';
  end if;

  delete from public.posts where id=p_post_id;
  insert into public.moderation_actions(moderator_id,action_type,target_type,target_id,reason)
  values(v_user,'delete','post',p_post_id,coalesce(p_reason,''));
end;
$$;

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
  v_target uuid;
begin
  select role into v_role from public.profiles where id=v_user;
  if v_user is null or v_role not in ('moderator','admin') then
    raise exception 'Staff access required';
  end if;

  select author_id into v_target from public.topics where id=p_topic_id;
  if private.is_system_owner(v_target) and v_target<>v_user then
    raise exception 'Conteúdo do proprietário da CreativeZone não pode ser moderado por outro membro da equipe.';
  end if;

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

revoke all on function public.review_project_member(uuid,uuid,text,text) from public, anon;
grant execute on function public.review_project_member(uuid,uuid,text,text) to authenticated, service_role;
revoke all on function public.update_project_status(uuid,text) from public, anon;
grant execute on function public.update_project_status(uuid,text) to authenticated, service_role;
revoke all on function public.moderate_chat_message(uuid,text,text) from public, anon;
grant execute on function public.moderate_chat_message(uuid,text,text) to authenticated, service_role;
revoke all on function public.moderate_post(uuid,text,text) from public, anon;
grant execute on function public.moderate_post(uuid,text,text) to authenticated, service_role;
revoke all on function public.moderate_topic(uuid,text,text) from public, anon;
grant execute on function public.moderate_topic(uuid,text,text) to authenticated, service_role;

update public.profiles
set system_owner=true,
    role='admin',
    account_status='active',
    profile_visibility='public',
    updated_at=now()
where lower(username)=lower('Miguel CreativeZone');

insert into public.user_memberships(
  user_id,plan_id,status,permanent,starts_at,ends_at,source,granted_by
)
select
  p.id,'elite','active',true,now(),null,'system',p.id
from public.profiles p
where p.system_owner=true
on conflict(user_id) do update
set plan_id='elite',
    status='active',
    permanent=true,
    ends_at=null,
    source='system',
    granted_by=excluded.user_id,
    updated_at=now();

insert into public.profile_cosmetics(
  user_id,name_color,profile_title,avatar_frame,cover_effect,badge_style
)
select
  p.id,'#FF3B30','Arquiteto CreativeZone','architect','architect','architect'
from public.profiles p
where p.system_owner=true
on conflict(user_id) do update
set name_color=excluded.name_color,
    profile_title=excluded.profile_title,
    avatar_frame=excluded.avatar_frame,
    cover_effect=excluded.cover_effect,
    badge_style=excluded.badge_style,
    updated_at=now();

insert into public.user_badges(user_id,badge_id)
select p.id,b.id
from public.profiles p
cross join public.badges b
where p.system_owner=true
  and b.slug='architect-creativezone'
on conflict do nothing;

with owner_totals as (
  select
    p.id,
    coalesce(sum(e.points),0)::integer as current_points
  from public.profiles p
  left join public.reputation_events e on e.user_id=p.id
  where p.system_owner=true
  group by p.id
),
grant_rows as (
  select
    id,
    greatest(0,1000000-current_points) as grant_points
  from owner_totals
)
insert into public.reputation_events(
  user_id,actor_id,event_type,points,source_type,source_id,source_key,metadata
)
select
  id,id,'system_grant',grant_points,'system',null,
  'creativezone-system-owner-max-xp',
  jsonb_build_object('reason','Permanent CreativeZone owner maximum XP grant')
from grant_rows
where grant_points>0
on conflict(source_key) do nothing;

do $$
declare r record;
begin
  for r in select id from public.profiles where system_owner=true loop
    perform private.award_gamification_badges(r.id);
  end loop;
end $$;
