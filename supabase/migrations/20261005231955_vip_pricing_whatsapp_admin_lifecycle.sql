-- CreativeZone VIP commerce, lifecycle automation, pricing and admin control plane.

alter table public.membership_plans
  add column if not exists price_cents integer not null default 0 check (price_cents >= 0),
  add column if not exists currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$');

update public.membership_plans
set price_cents=case id when 'pro' then 1999 when 'elite' then 2999 else 0 end,
    currency='BRL',
    updated_at=now()
where id in ('free','pro','elite');

alter table public.membership_upgrade_requests
  add column if not exists months_requested integer not null default 1 check (months_requested between 1 and 36),
  add column if not exists unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  add column if not exists total_price_cents integer not null default 0 check (total_price_cents >= 0),
  add column if not exists currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists reference_code text,
  add column if not exists contact_channel text not null default 'whatsapp' check (contact_channel in ('whatsapp','admin'));

update public.membership_upgrade_requests r
set unit_price_cents=coalesce(p.price_cents,0),
    total_price_cents=coalesce(p.price_cents,0) * greatest(1,r.months_requested),
    currency=coalesce(p.currency,'BRL'),
    reference_code=coalesce(r.reference_code,'CZ-' || upper(substr(replace(r.id::text,'-',''),1,10)))
from public.membership_plans p
where p.id=r.plan_id;

alter table public.membership_upgrade_requests alter column reference_code set not null;

create unique index if not exists membership_upgrade_requests_reference_key
  on public.membership_upgrade_requests(reference_code);

alter table public.user_memberships
  add column if not exists warning_7_sent_at timestamptz,
  add column if not exists warning_3_sent_at timestamptz,
  add column if not exists warning_1_sent_at timestamptz,
  add column if not exists expired_notified_at timestamptz,
  add column if not exists last_purchase_reference text;

alter table public.account_settings
  add column if not exists inapp_membership boolean not null default true,
  add column if not exists email_membership boolean not null default true,
  add column if not exists push_membership boolean not null default true;

create index if not exists user_memberships_expiry_scan_idx
  on public.user_memberships(ends_at)
  where status='active' and permanent=false and ends_at is not null;

create index if not exists membership_upgrade_requests_created_idx
  on public.membership_upgrade_requests(created_at desc);

revoke insert on public.membership_upgrade_requests from authenticated;

create or replace function public.create_membership_whatsapp_request(
  p_plan_id text,
  p_months integer,
  p_message text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_plan public.membership_plans%rowtype;
  v_request public.membership_upgrade_requests%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_plan_id not in ('pro','elite') then raise exception 'Plano inválido.'; end if;
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'Escolha entre 1 e 36 meses.'; end if;

  select * into v_plan from public.membership_plans where id=p_plan_id and active=true;
  if v_plan.id is null then raise exception 'Plano indisponível.'; end if;

  if exists (
    select 1 from public.membership_upgrade_requests
    where user_id=v_user and status='pending'
  ) then
    raise exception 'Você já possui uma solicitação de assinatura pendente.';
  end if;

  insert into public.membership_upgrade_requests(
    user_id,plan_id,message,status,months_requested,
    unit_price_cents,total_price_cents,currency,reference_code,contact_channel
  )
  values(
    v_user,v_plan.id,left(coalesce(p_message,''),1000),'pending',p_months,
    v_plan.price_cents,v_plan.price_cents*p_months,v_plan.currency,
    'CZ-' || upper(substr(replace(extensions.uuid_generate_v4()::text,'-',''),1,10)),
    'whatsapp'
  )
  returning * into v_request;

  return jsonb_build_object(
    'id',v_request.id,
    'reference_code',v_request.reference_code,
    'plan_id',v_plan.id,
    'plan_name',v_plan.name,
    'badge',v_plan.badge,
    'months',v_request.months_requested,
    'unit_price_cents',v_request.unit_price_cents,
    'total_price_cents',v_request.total_price_cents,
    'currency',v_request.currency
  );
end;
$$;

revoke all on function public.create_membership_whatsapp_request(text,integer,text) from public,anon;
grant execute on function public.create_membership_whatsapp_request(text,integer,text) to authenticated,service_role;

create or replace function public.admin_set_membership(
  p_user_id uuid,
  p_plan_id text,
  p_months integer default 1,
  p_permanent boolean default false,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_target_owner boolean := false;
  v_existing public.user_memberships%rowtype;
  v_plan public.membership_plans%rowtype;
  v_base timestamptz;
  v_ends timestamptz;
  v_reference text;
begin
  select role into v_actor_role from public.profiles where id=v_actor;
  if v_actor is null or v_actor_role <> 'admin' then raise exception 'Admin access required'; end if;

  select coalesce(system_owner,false) into v_target_owner from public.profiles where id=p_user_id;
  if not found then raise exception 'Membro não encontrado.'; end if;
  if v_target_owner and p_user_id<>v_actor then raise exception 'A assinatura do proprietário da CreativeZone é protegida.'; end if;

  if v_target_owner then
    p_plan_id := 'elite';
    p_permanent := true;
  end if;

  if p_plan_id not in ('pro','elite') then raise exception 'Escolha PRO ou ELITE.'; end if;
  if not p_permanent and (p_months is null or p_months < 1 or p_months > 36) then
    raise exception 'Escolha entre 1 e 36 meses.';
  end if;

  select * into v_plan from public.membership_plans where id=p_plan_id and active=true;
  if v_plan.id is null then raise exception 'Plano indisponível.'; end if;

  select * into v_existing from public.user_memberships where user_id=p_user_id;

  if p_request_id is not null then
    select reference_code into v_reference
    from public.membership_upgrade_requests
    where id=p_request_id and user_id=p_user_id;
  end if;

  if p_permanent then
    v_ends := null;
  else
    if v_existing.user_id is not null
       and v_existing.plan_id=p_plan_id
       and v_existing.status='active'
       and not v_existing.permanent
       and v_existing.ends_at is not null
       and v_existing.ends_at>now() then
      v_base := v_existing.ends_at;
    else
      v_base := now();
    end if;
    v_ends := v_base + make_interval(months => p_months);
  end if;

  insert into public.user_memberships(
    user_id,plan_id,status,permanent,starts_at,ends_at,source,granted_by,
    warning_7_sent_at,warning_3_sent_at,warning_1_sent_at,expired_notified_at,
    last_purchase_reference,updated_at
  )
  values(
    p_user_id,p_plan_id,'active',p_permanent,now(),v_ends,
    case when v_target_owner then 'system' else 'admin' end,
    v_actor,null,null,null,null,v_reference,now()
  )
  on conflict(user_id) do update
  set plan_id=excluded.plan_id,
      status='active',
      permanent=excluded.permanent,
      starts_at=case
        when public.user_memberships.plan_id=excluded.plan_id
          and public.user_memberships.status='active'
          and not public.user_memberships.permanent
          and public.user_memberships.ends_at>now()
        then public.user_memberships.starts_at
        else now()
      end,
      ends_at=excluded.ends_at,
      source=excluded.source,
      granted_by=excluded.granted_by,
      warning_7_sent_at=null,
      warning_3_sent_at=null,
      warning_1_sent_at=null,
      expired_notified_at=null,
      last_purchase_reference=coalesce(excluded.last_purchase_reference,public.user_memberships.last_purchase_reference),
      updated_at=now();

  if p_request_id is not null then
    update public.membership_upgrade_requests
    set status='approved',reviewed_by=v_actor,reviewed_at=now()
    where id=p_request_id and user_id=p_user_id and status='pending';
  end if;

  insert into public.moderation_actions(
    moderator_id,action_type,target_type,target_id,reason,metadata
  )
  values(
    v_actor,'membership_grant','profile',p_user_id,
    case when p_permanent then 'permanent' else p_months::text||' month(s)' end,
    jsonb_build_object(
      'plan_id',p_plan_id,
      'months',case when p_permanent then null else p_months end,
      'permanent',p_permanent,
      'ends_at',v_ends,
      'request_id',p_request_id
    )
  );

  return jsonb_build_object(
    'user_id',p_user_id,'plan_id',p_plan_id,'plan_name',v_plan.name,
    'permanent',p_permanent,'ends_at',v_ends,
    'months',case when p_permanent then null else p_months end
  );
end;
$$;

revoke all on function public.admin_set_membership(uuid,text,integer,boolean,uuid) from public,anon;
grant execute on function public.admin_set_membership(uuid,text,integer,boolean,uuid) to authenticated,service_role;

create or replace function public.admin_revoke_membership(
  p_user_id uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
begin
  select role into v_role from public.profiles where id=v_actor;
  if v_actor is null or v_role<>'admin' then raise exception 'Admin access required'; end if;
  if private.is_system_owner(p_user_id) then raise exception 'A assinatura permanente do proprietário não pode ser removida.'; end if;

  update public.user_memberships
  set status='cancelled',
      permanent=false,
      ends_at=case when starts_at<now() then now() else starts_at + interval '1 second' end,
      updated_at=now()
  where user_id=p_user_id;

  insert into public.moderation_actions(moderator_id,action_type,target_type,target_id,reason)
  values(v_actor,'membership_revoke','profile',p_user_id,left(coalesce(p_reason,''),2000));
end;
$$;

revoke all on function public.admin_revoke_membership(uuid,text) from public,anon;
grant execute on function public.admin_revoke_membership(uuid,text) to authenticated,service_role;

create or replace function public.admin_update_member(
  p_user_id uuid,
  p_role text,
  p_account_status text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
begin
  select role into v_actor_role from public.profiles where id=v_actor;
  if v_actor is null or v_actor_role<>'admin' then raise exception 'Admin access required'; end if;

  if p_role not in ('member','moderator','admin') then raise exception 'Cargo inválido.'; end if;
  if p_account_status not in ('active','deactivated') then raise exception 'Status inválido.'; end if;

  if private.is_system_owner(p_user_id) then
    if p_user_id<>v_actor then raise exception 'A conta proprietária da CreativeZone é protegida.'; end if;
    p_role := 'admin';
    p_account_status := 'active';
  end if;

  update public.profiles
  set role=p_role,account_status=p_account_status,updated_at=now()
  where id=p_user_id;

  insert into public.moderation_actions(
    moderator_id,action_type,target_type,target_id,reason,metadata
  )
  values(
    v_actor,'member_update','profile',p_user_id,'Admin member update',
    jsonb_build_object('role',p_role,'account_status',p_account_status)
  );
end;
$$;

revoke all on function public.admin_update_member(uuid,text,text) from public,anon;
grant execute on function public.admin_update_member(uuid,text,text) to authenticated,service_role;

create or replace function public.admin_review_category_suggestion(
  p_suggestion_id uuid,
  p_status text,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
begin
  select role into v_role from public.profiles where id=v_actor;
  if v_actor is null or v_role not in ('moderator','admin') then raise exception 'Staff access required'; end if;
  if p_status not in ('reviewing','approved','declined') then raise exception 'Status inválido.'; end if;

  update public.category_suggestions
  set status=p_status,
      reviewed_by=v_actor,
      reviewed_at=case when p_status in ('approved','declined') then now() else reviewed_at end,
      admin_note=left(coalesce(p_note,''),1200),
      updated_at=now()
  where id=p_suggestion_id;
end;
$$;

revoke all on function public.admin_review_category_suggestion(uuid,text,text) from public,anon;
grant execute on function public.admin_review_category_suggestion(uuid,text,text) to authenticated,service_role;

create or replace function public.admin_retry_email_job(p_queue_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
begin
  select role into v_role from public.profiles where id=v_actor;
  if v_actor is null or v_role<>'admin' then raise exception 'Admin access required'; end if;

  update private.notification_email_queue
  set status='pending',attempts=0,error_message=null,last_attempt_at=null
  where id=p_queue_id and status<>'sent';
end;
$$;

revoke all on function public.admin_retry_email_job(uuid) from public,anon;
grant execute on function public.admin_retry_email_job(uuid) to authenticated,service_role;

create or replace function public.get_admin_dashboard(
  p_search text default '',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_limit integer := greatest(10,least(coalesce(p_limit,100),250));
  v_result jsonb;
begin
  select role into v_role from public.profiles where id=v_actor;
  if v_actor is null or v_role<>'admin' then raise exception 'Admin access required'; end if;

  select jsonb_build_object(
    'metrics',jsonb_build_object(
      'members',(select count(*) from public.profiles),
      'new_members_7d',(select count(*) from public.profiles where created_at>=now()-interval '7 days'),
      'active_7d',(select count(*) from public.profiles where last_seen_at>=now()-interval '7 days'),
      'topics',(select count(*) from public.topics),
      'posts',(select count(*) from public.posts),
      'pending_reports',(select count(*) from public.reports where status in ('pending','reviewing')),
      'projects',(select count(*) from public.projects where status<>'archived'),
      'active_vips',(select count(*) from public.user_memberships where status='active' and (permanent or ends_at>now())),
      'expiring_vips_7d',(select count(*) from public.user_memberships where status='active' and not permanent and ends_at between now() and now()+interval '7 days'),
      'push_subscriptions',(select count(*) from public.push_subscriptions),
      'email_pending',(select count(*) from private.notification_email_queue where status in ('pending','sending')),
      'email_failed',(select count(*) from private.notification_email_queue where status='failed')
    ),
    'members',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          p.id,p.username,p.display_name,p.avatar_url,p.role,p.account_status,p.system_owner,
          p.reputation,p.created_at,p.last_seen_at,u.email,
          um.plan_id,um.status as membership_status,um.permanent,um.ends_at,
          mp.name as plan_name,mp.badge as plan_badge
        from public.profiles p
        join auth.users u on u.id=p.id
        left join public.user_memberships um on um.user_id=p.id
        left join public.membership_plans mp on mp.id=um.plan_id
        where nullif(btrim(p_search),'') is null
           or p.username ilike '%'||p_search||'%'
           or coalesce(p.display_name,'') ilike '%'||p_search||'%'
           or u.email ilike '%'||p_search||'%'
        order by p.created_at desc
        limit v_limit
      ) x
    ),'[]'::jsonb),
    'membership_requests',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          r.id,r.user_id,r.plan_id,r.message,r.status,r.months_requested,
          r.unit_price_cents,r.total_price_cents,r.currency,r.reference_code,
          r.contact_channel,r.created_at,r.reviewed_at,
          p.username,p.display_name,p.avatar_url,u.email,
          mp.name as plan_name,mp.badge as plan_badge
        from public.membership_upgrade_requests r
        join public.profiles p on p.id=r.user_id
        join auth.users u on u.id=r.user_id
        join public.membership_plans mp on mp.id=r.plan_id
        order by r.created_at desc
        limit 100
      ) x
    ),'[]'::jsonb),
    'reports',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          r.id,r.target_type,r.target_id,r.reason,r.details,r.status,
          r.resolution_note,r.created_at,r.reviewed_at,
          p.username as reporter_username,p.display_name as reporter_name
        from public.reports r
        left join public.profiles p on p.id=r.reporter_id
        order by case r.status when 'pending' then 0 when 'reviewing' then 1 else 2 end,r.created_at desc
        limit 100
      ) x
    ),'[]'::jsonb),
    'category_suggestions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          c.id,c.suggested_name,c.description,c.status,c.admin_note,
          c.created_at,c.reviewed_at,p.username,p.display_name
        from public.category_suggestions c
        join public.profiles p on p.id=c.user_id
        order by case c.status when 'pending' then 0 when 'reviewing' then 1 else 2 end,c.created_at desc
        limit 100
      ) x
    ),'[]'::jsonb),
    'projects',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select
          pr.id,pr.title,pr.slug,pr.status,pr.visibility,pr.updated_at,
          p.username as owner_username,p.display_name as owner_name
        from public.projects pr
        left join public.profiles p on p.id=pr.owner_id
        order by pr.updated_at desc
        limit 100
      ) x
    ),'[]'::jsonb),
    'email_queue',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          q.id,q.notification_id,q.user_id,q.recipient_email,q.notification_type,
          q.status,q.attempts,q.error_message,q.created_at,q.sent_at,q.last_attempt_at,
          p.username,p.display_name
        from private.notification_email_queue q
        join public.profiles p on p.id=q.user_id
        where q.status in ('pending','sending','failed')
        order by q.created_at desc
        limit 100
      ) x
    ),'[]'::jsonb),
    'audit',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          m.id,m.action_type,m.target_type,m.target_id,m.reason,m.metadata,m.created_at,
          p.username as moderator_username,p.display_name as moderator_name
        from public.moderation_actions m
        left join public.profiles p on p.id=m.moderator_id
        order by m.created_at desc
        limit 100
      ) x
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_dashboard(text,integer) from public,anon;
grant execute on function public.get_admin_dashboard(text,integer) to authenticated,service_role;

create or replace function private.membership_change_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan_name text;
  v_type text;
  v_message text;
begin
  if tg_op='UPDATE'
     and old.plan_id is not distinct from new.plan_id
     and old.status is not distinct from new.status
     and old.permanent is not distinct from new.permanent
     and old.ends_at is not distinct from new.ends_at then
    return new;
  end if;

  select name into v_plan_name from public.membership_plans where id=new.plan_id;

  if new.status='active' then
    v_type := 'membership_granted';
    v_message := case
      when new.permanent then v_plan_name||' foi ativado permanentemente.'
      else v_plan_name||' foi ativado até '||to_char(new.ends_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||'.'
    end;
  elsif new.status in ('expired','cancelled') then
    v_type := 'membership_expired';
    v_message := case when new.status='expired' then 'Seu '||v_plan_name||' expirou.' else 'Seu '||v_plan_name||' foi encerrado.' end;
  else
    return new;
  end if;

  insert into public.notifications(user_id,actor_id,type,data)
  values(
    new.user_id,
    case when new.granted_by=new.user_id then null else new.granted_by end,
    v_type,
    jsonb_build_object(
      'plan_id',new.plan_id,'plan_name',v_plan_name,'status',new.status,
      'permanent',new.permanent,'ends_at',new.ends_at,'message',v_message,
      'path','/conta/assinatura'
    )
  );

  return new;
end;
$$;

revoke all on function private.membership_change_notification() from public,anon,authenticated;

create or replace function private.process_membership_lifecycle()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_days integer;
  v_plan_name text;
begin
  for r in
    select um.user_id,um.plan_id,um.ends_at,
           um.warning_7_sent_at,um.warning_3_sent_at,um.warning_1_sent_at
    from public.user_memberships um
    where um.status='active' and um.permanent=false and um.ends_at is not null
    order by um.ends_at
  loop
    select name into v_plan_name from public.membership_plans where id=r.plan_id;

    if r.ends_at <= now() then
      update public.user_memberships
      set status='expired',expired_notified_at=coalesce(expired_notified_at,now()),updated_at=now()
      where user_id=r.user_id and status='active';
      continue;
    end if;

    v_days := greatest(1,ceil(extract(epoch from (r.ends_at-now()))/86400.0)::integer);

    if r.ends_at <= now()+interval '1 day' and r.warning_1_sent_at is null then
      insert into public.notifications(user_id,actor_id,type,data)
      values(r.user_id,null,'membership_expiring',jsonb_build_object(
        'plan_id',r.plan_id,'plan_name',v_plan_name,'days_left',1,'ends_at',r.ends_at,
        'message','Seu '||v_plan_name||' expira em menos de 24 horas.','path','/conta/assinatura'
      ));
      update public.user_memberships set warning_1_sent_at=now() where user_id=r.user_id;

    elsif r.ends_at <= now()+interval '3 days' and r.warning_3_sent_at is null then
      insert into public.notifications(user_id,actor_id,type,data)
      values(r.user_id,null,'membership_expiring',jsonb_build_object(
        'plan_id',r.plan_id,'plan_name',v_plan_name,'days_left',v_days,'ends_at',r.ends_at,
        'message','Seu '||v_plan_name||' expira em até 3 dias.','path','/conta/assinatura'
      ));
      update public.user_memberships set warning_3_sent_at=now() where user_id=r.user_id;

    elsif r.ends_at <= now()+interval '7 days' and r.warning_7_sent_at is null then
      insert into public.notifications(user_id,actor_id,type,data)
      values(r.user_id,null,'membership_expiring',jsonb_build_object(
        'plan_id',r.plan_id,'plan_name',v_plan_name,'days_left',v_days,'ends_at',r.ends_at,
        'message','Seu '||v_plan_name||' expira em até 7 dias.','path','/conta/assinatura'
      ));
      update public.user_memberships set warning_7_sent_at=now() where user_id=r.user_id;
    end if;
  end loop;
end;
$$;

revoke all on function private.process_membership_lifecycle() from public,anon,authenticated;

create or replace function private.queue_email_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enabled boolean := false;
  v_email text;
begin
  select case new.type
    when 'new_reply' then s.email_reply
    when 'topic_watch' then s.email_watch
    when 'mention' then s.email_mention
    when 'chat_mention' then s.email_mention
    when 'quote' then s.email_quote
    when 'reaction' then s.email_reaction
    when 'new_follower' then s.email_follower
    when 'direct_message' then s.email_dm
    when 'moderation' then s.email_moderation
    when 'membership_granted' then s.email_membership
    when 'membership_expiring' then s.email_membership
    when 'membership_expired' then s.email_membership
    else false
  end
  into v_enabled
  from public.account_settings s
  where s.user_id=new.user_id;

  if not coalesce(v_enabled,false) then return new; end if;

  select email into v_email from auth.users where id=new.user_id;
  if v_email is null then return new; end if;

  insert into private.notification_email_queue(
    notification_id,user_id,recipient_email,notification_type,payload
  ) values(new.id,new.user_id,v_email,new.type,new.data)
  on conflict(notification_id) do nothing;

  return new;
end;
$$;

revoke all on function private.queue_email_notification() from public,anon,authenticated;

create or replace function private.push_notification_webhook()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enabled boolean := false;
  v_hook_token text;
begin
  select (
    case new.type
      when 'new_reply' then s.push_reply
      when 'topic_watch' then s.push_watch
      when 'mention' then s.push_mention
      when 'chat_mention' then s.push_mention
      when 'quote' then s.push_quote
      when 'reaction' then s.push_reaction
      when 'new_follower' then s.push_follower
      when 'direct_message' then s.push_dm
      when 'moderation' then s.push_moderation
      when 'membership_granted' then s.push_membership
      when 'membership_expiring' then s.push_membership
      when 'membership_expired' then s.push_membership
      else false
    end
  ) and s.push_enabled
  into v_enabled
  from public.account_settings s
  where s.user_id=new.user_id;

  if not coalesce(v_enabled,false) then return new; end if;

  select decrypted_secret into v_hook_token
  from vault.decrypted_secrets
  where name='creativezone_push_webhook_token'
  order by created_at desc
  limit 1;

  if v_hook_token is null then return new; end if;

  perform net.http_post(
    url := 'https://ljxbewukkvenwjnjjjyf.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('notification_id',new.id),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','X-CreativeZone-Hook',v_hook_token),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

revoke all on function private.push_notification_webhook() from public,anon,authenticated;

select cron.schedule(
  'creativezone-membership-lifecycle',
  '17 * * * *',
  'select private.process_membership_lifecycle();'
);
