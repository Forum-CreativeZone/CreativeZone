create extension if not exists pg_net with schema extensions;

alter table public.profiles
  add column if not exists website_url text,
  add column if not exists github_url text,
  add column if not exists linkedin_url text,
  add column if not exists discord_handle text,
  add column if not exists account_status text not null default 'active',
  add column if not exists login_streak integer not null default 0,
  add column if not exists longest_login_streak integer not null default 0,
  add column if not exists last_login_date date;

do $$ begin
  alter table public.profiles
    add constraint profiles_account_status_check
    check (account_status in ('active','deactivated'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_login_streak_nonnegative
    check (login_streak >= 0 and longest_login_streak >= 0);
exception when duplicate_object then null; end $$;

alter table public.account_settings
  add column if not exists inapp_reply boolean not null default true,
  add column if not exists inapp_mention boolean not null default true,
  add column if not exists inapp_quote boolean not null default true,
  add column if not exists inapp_reaction boolean not null default true,
  add column if not exists inapp_follower boolean not null default true,
  add column if not exists inapp_dm boolean not null default true,
  add column if not exists inapp_moderation boolean not null default true,
  add column if not exists email_reply boolean not null default false,
  add column if not exists email_mention boolean not null default false,
  add column if not exists email_quote boolean not null default false,
  add column if not exists email_reaction boolean not null default false,
  add column if not exists email_follower boolean not null default false,
  add column if not exists email_dm boolean not null default false,
  add column if not exists email_moderation boolean not null default true,
  add column if not exists email_news boolean not null default false,
  add column if not exists push_enabled boolean not null default false,
  add column if not exists push_reply boolean not null default true,
  add column if not exists push_mention boolean not null default true,
  add column if not exists push_quote boolean not null default true,
  add column if not exists push_reaction boolean not null default true,
  add column if not exists push_follower boolean not null default true,
  add column if not exists push_dm boolean not null default true,
  add column if not exists push_moderation boolean not null default true;

create table if not exists public.account_audit_log (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.account_audit_log enable row level security;
create index if not exists account_audit_log_user_created_idx
  on public.account_audit_log(user_id, created_at desc);
drop policy if exists "users read own account audit" on public.account_audit_log;
create policy "users read own account audit"
on public.account_audit_log for select to authenticated
using ((select auth.uid()) = user_id);

create table if not exists public.device_sessions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  device_name text not null,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  unique(user_id, device_id)
);
alter table public.device_sessions enable row level security;
create index if not exists device_sessions_user_seen_idx
  on public.device_sessions(user_id, last_seen_at desc);
drop policy if exists "users manage own device sessions" on public.device_sessions;
create policy "users manage own device sessions"
on public.device_sessions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.push_subscriptions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);
drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions"
on public.push_subscriptions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists private.notification_email_queue (
  id uuid primary key default extensions.uuid_generate_v4(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  notification_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_email_queue_status_idx
  on private.notification_email_queue(status, created_at);

create or replace function private.birth_date_once()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.birth_date is not null
     and new.birth_date is distinct from old.birth_date
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'A data de nascimento já foi definida e não pode ser alterada.';
  end if;
  return new;
end;
$$;
drop trigger if exists lock_birth_date_after_set on public.account_settings;
create trigger lock_birth_date_after_set
before update of birth_date on public.account_settings
for each row execute function private.birth_date_once();

create or replace function public.log_account_event(
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_event_type not in (
    'profile_updated','avatar_updated','other_sessions_revoked',
    'push_enabled','push_disabled','account_deactivated',
    'account_reactivated','email_change_requested','security_reauth_requested'
  ) then
    raise exception 'Unsupported account event';
  end if;

  insert into public.account_audit_log(user_id,event_type,metadata)
  values(v_user,p_event_type,coalesce(p_metadata,'{}'::jsonb));
end;
$$;
revoke all on function public.log_account_event(text,jsonb) from public, anon;
grant execute on function public.log_account_event(text,jsonb) to authenticated;

create or replace function public.register_login_day()
returns table(login_streak integer, longest_login_streak integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := current_date;
  v_last date;
  v_streak integer;
  v_longest integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select p.last_login_date, p.login_streak, p.longest_login_streak
    into v_last, v_streak, v_longest
  from public.profiles p
  where p.id = v_user
  for update;

  if v_last = v_today then
    return query select v_streak, v_longest;
    return;
  end if;

  if v_last = v_today - 1 then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;
  v_longest := greatest(v_longest, v_streak);

  update public.profiles
  set last_login_date = v_today,
      login_streak = v_streak,
      longest_login_streak = v_longest
  where id = v_user;

  if v_streak >= 7 then
    insert into public.user_badges(user_id,badge_id)
    select v_user,id from public.badges where slug='streak-7'
    on conflict do nothing;
  end if;

  if v_streak >= 30 then
    insert into public.user_badges(user_id,badge_id)
    select v_user,id from public.badges where slug='streak-30'
    on conflict do nothing;
  end if;

  return query select v_streak, v_longest;
end;
$$;
revoke all on function public.register_login_day() from public, anon;
grant execute on function public.register_login_day() to authenticated;

insert into public.badges(slug,name,description,icon,points) values
  ('streak-7','Uma semana presente','Entrou na CreativeZone por 7 dias consecutivos.','🔥',15),
  ('streak-30','Presença lendária','Entrou na CreativeZone por 30 dias consecutivos.','🌟',60)
on conflict(slug) do update
set name=excluded.name,description=excluded.description,icon=excluded.icon,points=excluded.points;

create or replace function public.set_account_active(p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_active then
    update public.profiles
    set account_status='active',
        profile_visibility='public',
        allow_follow=true,
        allow_dm='members',
        updated_at=now()
    where id=v_user;

    insert into public.account_audit_log(user_id,event_type)
    values(v_user,'account_reactivated');
  else
    update public.profiles
    set account_status='deactivated',
        profile_visibility='private',
        allow_follow=false,
        allow_dm='none',
        updated_at=now()
    where id=v_user;

    delete from public.push_subscriptions where user_id=v_user;

    insert into public.account_audit_log(user_id,event_type)
    values(v_user,'account_deactivated');
  end if;
end;
$$;
revoke all on function public.set_account_active(boolean) from public, anon;
grant execute on function public.set_account_active(boolean) to authenticated;

create or replace function private.audit_auth_user_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    insert into public.account_audit_log(user_id,event_type,metadata)
    values(new.id,'email_changed',jsonb_build_object('old_email',old.email,'new_email',new.email));
  end if;

  if new.encrypted_password is distinct from old.encrypted_password then
    insert into public.account_audit_log(user_id,event_type)
    values(new.id,'password_changed');
  end if;
  return new;
end;
$$;
drop trigger if exists audit_auth_user_updates on auth.users;
create trigger audit_auth_user_updates
after update on auth.users
for each row execute function private.audit_auth_user_updates();

create or replace function private.audit_identity_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_provider text;
begin
  if tg_op='INSERT' then
    v_user := new.user_id;
    v_provider := new.provider;
    insert into public.account_audit_log(user_id,event_type,metadata)
    values(v_user,'identity_connected',jsonb_build_object('provider',v_provider));
    return new;
  end if;

  v_user := old.user_id;
  v_provider := old.provider;
  insert into public.account_audit_log(user_id,event_type,metadata)
  values(v_user,'identity_disconnected',jsonb_build_object('provider',v_provider));
  return old;
end;
$$;
drop trigger if exists audit_identity_changes on auth.identities;
create trigger audit_identity_changes
after insert or delete on auth.identities
for each row execute function private.audit_identity_changes();

create or replace function private.audit_profile_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is distinct from old.username then
    insert into public.account_audit_log(user_id,event_type,metadata)
    values(new.id,'username_changed',jsonb_build_object('old_username',old.username,'new_username',new.username));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_profile_username on public.profiles;
create trigger audit_profile_username
after update of username on public.profiles
for each row execute function private.audit_profile_username();

create or replace function private.queue_email_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := false;
  v_email text;
begin
  select case new.type
    when 'new_reply' then s.email_reply
    when 'mention' then s.email_mention
    when 'quote' then s.email_quote
    when 'reaction' then s.email_reaction
    when 'new_follower' then s.email_follower
    when 'direct_message' then s.email_dm
    when 'moderation' then s.email_moderation
    else false
  end
  into v_enabled
  from public.account_settings s
  where s.user_id=new.user_id;

  if not coalesce(v_enabled,false) then
    return new;
  end if;

  select email into v_email from auth.users where id=new.user_id;
  if v_email is null then
    return new;
  end if;

  insert into private.notification_email_queue(
    notification_id,user_id,recipient_email,notification_type,payload
  ) values(new.id,new.user_id,v_email,new.type,new.data)
  on conflict(notification_id) do nothing;

  return new;
end;
$$;
drop trigger if exists queue_notification_email on public.notifications;
create trigger queue_notification_email
after insert on public.notifications
for each row execute function private.queue_email_notification();

create or replace function private.notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mentioned text;
  quoted text;
  target_id uuid;
  body text;
  topic_ref uuid;
begin
  body := coalesce(new.content, '');
  if tg_table_name = 'topics' then
    topic_ref := new.id;
  else
    topic_ref := new.topic_id;
  end if;

  for quoted in
    select distinct lower((m)[1])
    from regexp_matches(body, '\[quote=@([A-Za-z0-9_-]{3,30})\]', 'g') as m
  loop
    select id into target_id
    from public.profiles
    where lower(username)=quoted
    limit 1;

    if target_id is not null and target_id<>new.author_id then
      insert into public.notifications(user_id,actor_id,type,data)
      values(
        target_id,new.author_id,'quote',
        jsonb_build_object(
          'topic_id',topic_ref,
          'post_id',case when tg_table_name='posts' then new.id else null end
        )
      );
    end if;
  end loop;

  body := regexp_replace(body, '\[quote=@[A-Za-z0-9_-]{3,30}\]', '', 'g');

  for mentioned in
    select distinct lower((m)[1])
    from regexp_matches(body, '@([A-Za-z0-9_-]{3,30})', 'g') as m
  loop
    select id into target_id
    from public.profiles
    where lower(username)=mentioned
    limit 1;

    if target_id is not null and target_id<>new.author_id then
      insert into public.notifications(user_id,actor_id,type,data)
      values(
        target_id,new.author_id,'mention',
        jsonb_build_object(
          'topic_id',topic_ref,
          'post_id',case when tg_table_name='posts' then new.id else null end
        )
      );
    end if;
  end loop;
  return new;
end;
$$;

create or replace function private.push_notification_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := false;
begin
  select case new.type
    when 'new_reply' then s.push_reply
    when 'mention' then s.push_mention
    when 'quote' then s.push_quote
    when 'reaction' then s.push_reaction
    when 'new_follower' then s.push_follower
    when 'direct_message' then s.push_dm
    when 'moderation' then s.push_moderation
    else false
  end and s.push_enabled
  into v_enabled
  from public.account_settings s
  where s.user_id=new.user_id;

  if coalesce(v_enabled,false) then
    perform extensions.http_post(
      url := 'https://ljxbewukkvenwjnjjjyf.supabase.co/functions/v1/send-push',
      body := jsonb_build_object('notification_id',new.id),
      params := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json'),
      timeout_milliseconds := 5000
    );
  end if;

  return new;
end;
$$;
drop trigger if exists send_notification_push on public.notifications;
create trigger send_notification_push
after insert on public.notifications
for each row execute function private.push_notification_webhook();

create or replace function public.get_web_push_vapid_private()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='creativezone_vapid_private'
  order by created_at desc
  limit 1;
$$;
revoke all on function public.get_web_push_vapid_private() from public, anon, authenticated;
grant execute on function public.get_web_push_vapid_private() to service_role;

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update to authenticated
using ((select auth.uid())=id)
with check ((select auth.uid())=id);

-- Keep authored forum content when a user permanently deletes their account.
alter table public.topics alter column author_id drop not null;
alter table public.posts alter column author_id drop not null;

alter table public.topics drop constraint if exists topics_author_id_fkey;
alter table public.topics
  add constraint topics_author_id_fkey
  foreign key(author_id) references public.profiles(id) on delete set null;

alter table public.posts drop constraint if exists posts_author_id_fkey;
alter table public.posts
  add constraint posts_author_id_fkey
  foreign key(author_id) references public.profiles(id) on delete set null;

revoke all on public.account_audit_log from anon;
revoke all on public.device_sessions from anon;
revoke all on public.push_subscriptions from anon;

grant select on public.account_audit_log to authenticated;
grant select,insert,update,delete on public.device_sessions to authenticated;
grant select,insert,update,delete on public.push_subscriptions to authenticated;

grant update (
  username,display_name,avatar_url,bio,occupation,interests,status_message,signature,
  last_seen_at,location,show_activity,show_online,allow_follow,show_followers,allow_dm,
  profile_completed,public_birth_day,public_birth_month,public_birth_year,profile_visibility,
  website_url,github_url,linkedin_url,discord_handle
) on public.profiles to authenticated;

grant update (
  birth_date,location_private,theme,language,density,email_updates,content_filter,
  show_birth_day,show_birth_year,show_location,
  inapp_reply,inapp_mention,inapp_quote,inapp_reaction,inapp_follower,inapp_dm,inapp_moderation,
  email_reply,email_mention,email_quote,email_reaction,email_follower,email_dm,email_moderation,email_news,
  push_enabled,push_reply,push_mention,push_quote,push_reaction,push_follower,push_dm,push_moderation
) on public.account_settings to authenticated;
