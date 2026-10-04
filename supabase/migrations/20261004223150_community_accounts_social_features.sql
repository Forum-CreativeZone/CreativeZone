create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter table public.profiles
  add column if not exists occupation text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists status_message text not null default '',
  add column if not exists signature text not null default '',
  add column if not exists reputation integer not null default 0,
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists location text,
  add column if not exists show_activity boolean not null default true,
  add column if not exists show_online boolean not null default true,
  add column if not exists allow_follow boolean not null default true,
  add column if not exists show_followers boolean not null default true,
  add column if not exists allow_dm text not null default 'members',
  add column if not exists profile_completed boolean not null default false;

do $$ begin
  alter table public.profiles add constraint profiles_reputation_nonnegative check (reputation >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_allow_dm_check check (allow_dm in ('members','following','none'));
exception when duplicate_object then null; end $$;

create table if not exists public.account_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  birth_date date,
  location_private text,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  language text not null default 'pt-BR',
  density text not null default 'comfortable' check (density in ('comfortable','compact')),
  email_updates boolean not null default false,
  content_filter text not null default 'standard' check (content_filter in ('standard','strict')),
  show_birth_day boolean not null default false,
  show_birth_year boolean not null default false,
  show_location boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.account_settings enable row level security;
create policy "own account settings" on public.account_settings for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
insert into public.account_settings (user_id) select id from public.profiles on conflict (user_id) do nothing;

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
alter table public.follows enable row level security;
create policy "follows public read" on public.follows for select to public using (true);
create policy "users follow" on public.follows for insert to authenticated
with check ((select auth.uid()) = follower_id and following_id <> follower_id
  and coalesce((select allow_follow from public.profiles where id = following_id), false));
create policy "users unfollow" on public.follows for delete to authenticated
using ((select auth.uid()) = follower_id);
create index if not exists follows_following_id_idx on public.follows(following_id);

create table if not exists public.ignores (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  ignored_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, ignored_id),
  check (blocker_id <> ignored_id)
);
alter table public.ignores enable row level security;
create policy "own ignores" on public.ignores for all to authenticated
using ((select auth.uid()) = blocker_id) with check ((select auth.uid()) = blocker_id);

create table if not exists public.direct_messages (
  id uuid primary key default extensions.uuid_generate_v4(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 5000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
alter table public.direct_messages enable row level security;
create index if not exists direct_messages_sender_created_idx on public.direct_messages(sender_id, created_at desc);
create index if not exists direct_messages_recipient_created_idx on public.direct_messages(recipient_id, created_at desc);

create or replace function private.can_message(target_user uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); dm_mode text;
begin
  if actor is null or target_user is null or actor = target_user then return false; end if;
  if exists (select 1 from public.ignores
    where (blocker_id = target_user and ignored_id = actor)
       or (blocker_id = actor and ignored_id = target_user)) then return false; end if;
  select allow_dm into dm_mode from public.profiles where id = target_user;
  if dm_mode is null or dm_mode = 'none' then return false; end if;
  if dm_mode = 'following' then
    return exists (select 1 from public.follows where follower_id = target_user and following_id = actor);
  end if;
  return true;
end; $$;
revoke all on function private.can_message(uuid) from public;
grant execute on function private.can_message(uuid) to authenticated;

create policy "participants read messages" on public.direct_messages for select to authenticated
using ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id);
create policy "users send messages" on public.direct_messages for insert to authenticated
with check ((select auth.uid()) = sender_id and private.can_message(recipient_id));
create policy "recipients mark messages read" on public.direct_messages for update to authenticated
using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);
create policy "senders delete messages" on public.direct_messages for delete to authenticated
using ((select auth.uid()) = sender_id);

create table if not exists public.badges (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  description text not null,
  icon text not null default '🏆',
  points integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.badges enable row level security;
create policy "badges public read" on public.badges for select to public using (true);

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
alter table public.user_badges enable row level security;
create policy "user badges public read" on public.user_badges for select to public using (true);
create index if not exists user_badges_badge_id_idx on public.user_badges(badge_id);

insert into public.badges (slug,name,description,icon,points) values
 ('first-topic','Primeiro tópico','Publicou o primeiro tópico na CreativeZone.','📝',5),
 ('first-reply','Primeira resposta','Participou de uma discussão pela primeira vez.','💬',3),
 ('contributor-10','Colaborador','Publicou pelo menos 10 respostas.','🤝',20),
 ('well-liked-10','Bem avaliado','Alcançou 10 pontos de reputação.','⭐',25),
 ('veteran','Veterano','Faz parte da comunidade há bastante tempo.','🏆',50)
on conflict (slug) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,points=excluded.points;

create policy "reactions public read" on public.reactions for select to public using (true);
do $$ begin
 alter table public.reactions add constraint reactions_one_target check (
  ((topic_id is not null)::integer + (post_id is not null)::integer) = 1);
exception when duplicate_object then null; end $$;

create or replace function private.notify_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.notifications (user_id,actor_id,type,data)
 select t.author_id,new.author_id,'new_reply',jsonb_build_object('topic_id',new.topic_id,'post_id',new.id)
 from public.topics t where t.id=new.topic_id and t.author_id<>new.author_id;
 return new;
end; $$;
drop trigger if exists notify_reply_created on public.posts;
create trigger notify_reply_created after insert on public.posts for each row execute function private.notify_reply();

create or replace function private.notify_mentions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare mentioned text; target_id uuid; body text; topic_ref uuid;
begin
 body:=coalesce(new.content,'');
 if tg_table_name='topics' then topic_ref:=new.id; else topic_ref:=new.topic_id; end if;
 for mentioned in select distinct lower((m)[1]) from regexp_matches(body,'@([A-Za-z0-9_-]{3,30})','g') as m loop
  select id into target_id from public.profiles where lower(username)=mentioned limit 1;
  if target_id is not null and target_id<>new.author_id then
   insert into public.notifications(user_id,actor_id,type,data) values(
    target_id,new.author_id,'mention',
    jsonb_build_object('topic_id',topic_ref,'post_id',case when tg_table_name='posts' then new.id else null end));
  end if;
 end loop;
 return new;
end; $$;
create trigger notify_topic_mentions after insert on public.topics for each row execute function private.notify_mentions();
create trigger notify_post_mentions after insert on public.posts for each row execute function private.notify_mentions();

create or replace function private.follow_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(user_id,actor_id,type,data)
 values(new.following_id,new.follower_id,'new_follower','{}'::jsonb);
 return new;
end; $$;
create trigger follow_notification after insert on public.follows for each row execute function private.follow_event();

create or replace function private.message_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(user_id,actor_id,type,data)
 values(new.recipient_id,new.sender_id,'direct_message',jsonb_build_object('message_id',new.id));
 return new;
end; $$;
create trigger direct_message_notification after insert on public.direct_messages for each row execute function private.message_event();

create or replace function private.reaction_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_author uuid; target_topic uuid; target_post uuid; next_rep integer;
begin
 if tg_op='INSERT' then
  target_topic:=new.topic_id; target_post:=new.post_id;
  if new.topic_id is not null then
   select author_id into target_author from public.topics where id=new.topic_id;
  else
   select author_id,topic_id into target_author,target_topic from public.posts where id=new.post_id;
  end if;
  if target_author is not null and target_author<>new.user_id then
   update public.profiles set reputation=reputation+1 where id=target_author returning reputation into next_rep;
   insert into public.notifications(user_id,actor_id,type,data)
   values(target_author,new.user_id,'reaction',jsonb_build_object('topic_id',target_topic,'post_id',target_post,'reaction',new.type));
   if next_rep>=10 then
    insert into public.user_badges(user_id,badge_id)
    select target_author,id from public.badges where slug='well-liked-10' on conflict do nothing;
   end if;
  end if;
  return new;
 end if;
 if old.topic_id is not null then select author_id into target_author from public.topics where id=old.topic_id;
 else select author_id into target_author from public.posts where id=old.post_id; end if;
 if target_author is not null and target_author<>old.user_id then
  update public.profiles set reputation=greatest(0,reputation-1) where id=target_author;
 end if;
 return old;
end; $$;
create trigger reaction_reputation_event after insert or delete on public.reactions
for each row execute function private.reaction_event();

create or replace function private.content_badges() returns trigger
language plpgsql security definer set search_path='' as $$
declare reply_count integer;
begin
 if tg_table_name='topics' then
  insert into public.user_badges(user_id,badge_id) select new.author_id,id from public.badges where slug='first-topic' on conflict do nothing;
 else
  insert into public.user_badges(user_id,badge_id) select new.author_id,id from public.badges where slug='first-reply' on conflict do nothing;
  select count(*) into reply_count from public.posts where author_id=new.author_id;
  if reply_count>=10 then
   insert into public.user_badges(user_id,badge_id) select new.author_id,id from public.badges where slug='contributor-10' on conflict do nothing;
  end if;
 end if;
 return new;
end; $$;
create trigger topic_badges after insert on public.topics for each row execute function private.content_badges();
create trigger post_badges after insert on public.posts for each row execute function private.content_badges();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_username text; v_display_name text; v_avatar_url text;
begin
 v_username:=coalesce(new.raw_user_meta_data->>'username',new.raw_user_meta_data->>'user_name',
  new.raw_user_meta_data->>'preferred_username',split_part(coalesce(new.email,''),'@',1),'user');
 v_username:=nullif(trim(both '_' from regexp_replace(lower(v_username),'[^a-z0-9_-]+','_','g')),'');
 if v_username is null then v_username:='user'; end if;
 if exists(select 1 from public.profiles where username=v_username) then
  v_username:=left(v_username,20)||'_'||substr(new.id::text,1,8);
 end if;
 v_display_name:=coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',v_username);
 v_avatar_url:=coalesce(new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture');
 insert into public.profiles(id,username,display_name,avatar_url)
 values(new.id,v_username,v_display_name,v_avatar_url)
 on conflict(id) do update set username=excluded.username,display_name=excluded.display_name,
  avatar_url=coalesce(excluded.avatar_url,public.profiles.avatar_url),updated_at=now();
 insert into public.account_settings(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end; $$;
revoke execute on function public.handle_new_user() from public,anon,authenticated;

drop trigger if exists account_settings_set_updated_at on public.account_settings;
create trigger account_settings_set_updated_at before update on public.account_settings
for each row execute function public.set_updated_at();

update storage.buckets
set file_size_limit=5242880,
 allowed_mime_types=array['image/png','image/jpeg','image/webp','image/gif']
where id='avatars';
