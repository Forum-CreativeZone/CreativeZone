
alter table public.categories
  add column if not exists parent_id uuid,
  add column if not exists node_type text not null default 'forum',
  add column if not exists sort_order integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='categories_parent_id_fkey'
      and conrelid='public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_parent_id_fkey
      foreign key(parent_id)
      references public.categories(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='categories_node_type_check'
      and conrelid='public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_node_type_check
      check (node_type in ('category','section','forum'));
  end if;
end $$;

create index if not exists categories_parent_sort_idx
  on public.categories(parent_id,sort_order,name);

create or replace function private.validate_category_hierarchy()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_parent_type text;
  v_cycle boolean := false;
begin
  if new.node_type='category' then
    if new.parent_id is not null then
      raise exception 'Top-level categories cannot have a parent';
    end if;
    return new;
  end if;

  if new.parent_id is null then
    raise exception 'Sections and forums require a parent category';
  end if;

  if new.id is not null and new.parent_id=new.id then
    raise exception 'A category cannot be its own parent';
  end if;

  select node_type into v_parent_type
  from public.categories
  where id=new.parent_id;

  if v_parent_type is null then
    raise exception 'Parent category not found';
  end if;

  if new.node_type='section' and v_parent_type <> 'category' then
    raise exception 'A section must belong to a top-level category';
  end if;

  if new.node_type='forum' and v_parent_type not in ('category','section') then
    raise exception 'A forum must belong to a category or section';
  end if;

  if tg_op='UPDATE' and new.parent_id is distinct from old.parent_id then
    with recursive descendants as (
      select id,parent_id from public.categories where parent_id=new.id
      union all
      select c.id,c.parent_id
      from public.categories c
      join descendants d on c.parent_id=d.id
    )
    select exists(select 1 from descendants where id=new.parent_id)
    into v_cycle;

    if v_cycle then
      raise exception 'Category hierarchy cannot contain cycles';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_category_hierarchy() from public,anon,authenticated;

drop trigger if exists validate_category_hierarchy on public.categories;
create trigger validate_category_hierarchy
before insert or update of parent_id,node_type
on public.categories
for each row execute function private.validate_category_hierarchy();

create or replace function private.validate_topic_forum_category()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_type text;
begin
  select node_type into v_type
  from public.categories
  where id=new.category_id;

  if v_type is distinct from 'forum' then
    raise exception 'Topics can only be created inside forum nodes';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_topic_forum_category() from public,anon,authenticated;

drop trigger if exists validate_topic_forum_category on public.topics;
create trigger validate_topic_forum_category
before insert or update of category_id
on public.topics
for each row execute function private.validate_topic_forum_category();

with root as (
  update public.categories
  set
    node_type='category',
    parent_id=null,
    sort_order=10,
    description='Categoria principal da comunidade CreativeZone.'
  where slug='creativezone'
  returning id
),
section as (
  insert into public.categories(name,slug,description,parent_id,node_type,sort_order)
  select
    'Central da Comunidade',
    'central-da-comunidade',
    'Informações essenciais, orientações e áreas oficiais da comunidade.',
    root.id,
    'section',
    10
  from root
  on conflict(slug) do update
    set name=excluded.name,
        description=excluded.description,
        parent_id=excluded.parent_id,
        node_type=excluded.node_type,
        sort_order=excluded.sort_order
  returning id
),
rules_forum as (
  insert into public.categories(name,slug,description,parent_id,node_type,sort_order)
  select
    'Regras e Comunicados',
    'regras-e-comunicados',
    'Regras oficiais, orientações, avisos e comunicados importantes da CreativeZone.',
    section.id,
    'forum',
    10
  from section
  on conflict(slug) do update
    set name=excluded.name,
        description=excluded.description,
        parent_id=excluded.parent_id,
        node_type=excluded.node_type,
        sort_order=excluded.sort_order
  returning id
)
update public.topics t
set category_id=rules_forum.id
from rules_forum
where t.slug='regras-oficiais-da-creativezone';

create table if not exists public.topic_watches (
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(topic_id,user_id)
);

create index if not exists topic_watches_user_created_idx
  on public.topic_watches(user_id,created_at desc);

alter table public.topic_watches enable row level security;

drop policy if exists "users read own topic watches" on public.topic_watches;
create policy "users read own topic watches"
on public.topic_watches for select
to authenticated
using (user_id=(select auth.uid()));

drop policy if exists "users watch topics" on public.topic_watches;
create policy "users watch topics"
on public.topic_watches for insert
to authenticated
with check (
  user_id=(select auth.uid())
  and exists(select 1 from public.topics t where t.id=topic_id)
);

drop policy if exists "users unwatch topics" on public.topic_watches;
create policy "users unwatch topics"
on public.topic_watches for delete
to authenticated
using (user_id=(select auth.uid()));

revoke all on table public.topic_watches from anon,authenticated;
grant select,insert,delete on table public.topic_watches to authenticated;

create or replace function private.notify_topic_watchers_on_reply()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_topic_author uuid;
begin
  select author_id into v_topic_author
  from public.topics
  where id=new.topic_id;

  insert into public.notifications(user_id,actor_id,type,data)
  select
    w.user_id,
    new.author_id,
    'topic_watch',
    jsonb_build_object(
      'topic_id',new.topic_id,
      'post_id',new.id,
      'event','reply'
    )
  from public.topic_watches w
  where w.topic_id=new.topic_id
    and w.user_id is distinct from new.author_id
    and w.user_id is distinct from v_topic_author;

  return new;
end;
$$;

revoke all on function private.notify_topic_watchers_on_reply() from public,anon,authenticated;

drop trigger if exists notify_topic_watchers_on_reply on public.posts;
create trigger notify_topic_watchers_on_reply
after insert on public.posts
for each row execute function private.notify_topic_watchers_on_reply();

create or replace function private.notify_topic_watchers_on_topic_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if
    new.title is not distinct from old.title
    and new.content is not distinct from old.content
    and new.category_id is not distinct from old.category_id
    and new.locked is not distinct from old.locked
    and new.pinned is not distinct from old.pinned
  then
    return new;
  end if;

  insert into public.notifications(user_id,actor_id,type,data)
  select
    w.user_id,
    v_actor,
    'topic_watch',
    jsonb_build_object(
      'topic_id',new.id,
      'event','topic_update'
    )
  from public.topic_watches w
  where w.topic_id=new.id
    and w.user_id is distinct from v_actor;

  return new;
end;
$$;

revoke all on function private.notify_topic_watchers_on_topic_update() from public,anon,authenticated;

drop trigger if exists notify_topic_watchers_on_topic_update on public.topics;
create trigger notify_topic_watchers_on_topic_update
after update on public.topics
for each row execute function private.notify_topic_watchers_on_topic_update();

create or replace function private.notify_topic_watchers_on_post_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if new.content is not distinct from old.content then
    return new;
  end if;

  insert into public.notifications(user_id,actor_id,type,data)
  select
    w.user_id,
    coalesce(v_actor,new.author_id),
    'topic_watch',
    jsonb_build_object(
      'topic_id',new.topic_id,
      'post_id',new.id,
      'event','reply_update'
    )
  from public.topic_watches w
  where w.topic_id=new.topic_id
    and w.user_id is distinct from coalesce(v_actor,new.author_id);

  return new;
end;
$$;

revoke all on function private.notify_topic_watchers_on_post_update() from public,anon,authenticated;

drop trigger if exists notify_topic_watchers_on_post_update on public.posts;
create trigger notify_topic_watchers_on_post_update
after update on public.posts
for each row execute function private.notify_topic_watchers_on_post_update();

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
    when 'topic_watch' then s.email_reply
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
      when 'topic_watch' then s.push_reply
      when 'mention' then s.push_mention
      when 'quote' then s.push_quote
      when 'reaction' then s.push_reaction
      when 'new_follower' then s.push_follower
      when 'direct_message' then s.push_dm
      when 'moderation' then s.push_moderation
      else false
    end
  ) and s.push_enabled
  into v_enabled
  from public.account_settings s
  where s.user_id=new.user_id;

  if not coalesce(v_enabled,false) then
    return new;
  end if;

  select decrypted_secret into v_hook_token
  from vault.decrypted_secrets
  where name='creativezone_push_webhook_token'
  order by created_at desc
  limit 1;

  if v_hook_token is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://ljxbewukkvenwjnjjjyf.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('notification_id',new.id),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-CreativeZone-Hook',v_hook_token
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

create or replace function public.get_forum_author_stats(p_author_ids uuid[])
returns table(
  profile_id uuid,
  topic_count bigint,
  post_count bigint
)
language sql
stable
set search_path=''
as $$
  select
    p.id,
    (select count(*) from public.topics t where t.author_id=p.id),
    (select count(*) from public.posts po where po.author_id=p.id)
  from public.profiles p
  where p.id=any(coalesce(p_author_ids,'{}'::uuid[]));
$$;

revoke all on function public.get_forum_author_stats(uuid[]) from public;
grant execute on function public.get_forum_author_stats(uuid[]) to anon,authenticated;
