-- CreativeZone: complete interactive forum layer
create extension if not exists pg_trgm with schema extensions;

alter table public.profiles
  add column if not exists cover_url text,
  add column if not exists portfolio_url text,
  add column if not exists skills text[] not null default '{}'::text[],
  add column if not exists technologies text[] not null default '{}'::text[];

alter table public.topics add column if not exists accepted_answer_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='topics_accepted_answer_id_fkey'
      and conrelid='public.topics'::regclass
  ) then
    alter table public.topics
      add constraint topics_accepted_answer_id_fkey
      foreign key (accepted_answer_id) references public.posts(id) on delete set null;
  end if;
end $$;

create index if not exists topics_accepted_answer_idx
  on public.topics(accepted_answer_id) where accepted_answer_id is not null;

create table if not exists public.reputation_events (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'topic_created','reply_created','reaction_received','accepted_answer','legacy_adjustment'
  )),
  points integer not null check (points between -100 and 100),
  source_type text not null default '',
  source_id uuid,
  source_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.reputation_events enable row level security;
drop policy if exists "reputation events visible" on public.reputation_events;
create policy "reputation events visible" on public.reputation_events
for select to anon,authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id=reputation_events.user_id and (
      p.profile_visibility='public'
      or (p.profile_visibility='members' and (select auth.uid()) is not null)
      or p.id=(select auth.uid())
    )
  )
);
grant select on public.reputation_events to anon,authenticated;
create index if not exists reputation_events_user_created_idx on public.reputation_events(user_id,created_at desc);
create index if not exists reputation_events_period_idx on public.reputation_events(created_at desc,user_id);

insert into public.badges(slug,name,description,icon,points) values
  ('level-member','Membro','Alcançou o nível Membro na comunidade.','🌱',50),
  ('level-specialist','Especialista','Alcançou o nível Especialista.','🧠',200),
  ('level-master','Mestre','Alcançou o nível Mestre.','🏅',500),
  ('level-legend','Lenda','Alcançou o nível Lenda.','👑',1000),
  ('solver-1','Solucionador','Teve uma resposta marcada como solução.','✅',20),
  ('solver-10','Mentor da Comunidade','Teve 10 respostas marcadas como solução.','🛟',200),
  ('popular-25','Voz da Comunidade','Recebeu 25 reações em suas publicações.','🔥',50)
on conflict(slug) do update set
  name=excluded.name,description=excluded.description,icon=excluded.icon,points=excluded.points;

create or replace function public.reputation_level(p_points integer)
returns text language sql immutable set search_path=''
as $$
  select case
    when coalesce(p_points,0)>=1000 then 'Lenda'
    when coalesce(p_points,0)>=500 then 'Mestre'
    when coalesce(p_points,0)>=200 then 'Especialista'
    when coalesce(p_points,0)>=50 then 'Membro'
    else 'Novato'
  end;
$$;
revoke all on function public.reputation_level(integer) from public;
grant execute on function public.reputation_level(integer) to anon,authenticated,service_role;

create or replace function private.award_gamification_badges(p_user uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_rep integer:=0;v_solutions integer:=0;v_reactions integer:=0;
begin
  if p_user is null then return; end if;
  select coalesce(reputation,0) into v_rep from public.profiles where id=p_user;
  select count(*) into v_solutions from public.reputation_events where user_id=p_user and event_type='accepted_answer' and points>0;
  select count(*) into v_reactions from public.reputation_events where user_id=p_user and event_type='reaction_received' and points>0;
  if v_rep>=50 then insert into public.user_badges(user_id,badge_id) select p_user,id from public.badges where slug='level-member' on conflict do nothing; end if;
  if v_rep>=200 then insert into public.user_badges(user_id,badge_id) select p_user,id from public.badges where slug='level-specialist' on conflict do nothing; end if;
  if v_rep>=500 then insert into public.user_badges(user_id,badge_id) select p_user,id from public.badges where slug='level-master' on conflict do nothing; end if;
  if v_rep>=1000 then insert into public.user_badges(user_id,badge_id) select p_user,id from public.badges where slug='level-legend' on conflict do nothing; end if;
  if v_solutions>=1 then insert into public.user_badges(user_id,badge_id) select p_user,id from public.badges where slug='solver-1' on conflict do nothing; end if;
  if v_solutions>=10 then insert into public.user_badges(user_id,badge_id) select p_user,id from public.badges where slug='solver-10' on conflict do nothing; end if;
  if v_reactions>=25 then insert into public.user_badges(user_id,badge_id) select p_user,id from public.badges where slug='popular-25' on conflict do nothing; end if;
end;$$;
revoke all on function private.award_gamification_badges(uuid) from public,anon,authenticated;

create or replace function private.adjust_reputation_from_event()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_user uuid;v_delta integer;
begin
  if tg_op='INSERT' then v_user:=new.user_id;v_delta:=new.points;
  else v_user:=old.user_id;v_delta:=-old.points; end if;
  update public.profiles set reputation=greatest(0,coalesce(reputation,0)+v_delta),updated_at=now() where id=v_user;
  perform private.award_gamification_badges(v_user);
  return coalesce(new,old);
end;$$;
revoke all on function private.adjust_reputation_from_event() from public,anon,authenticated;
drop trigger if exists reputation_events_adjust_profile on public.reputation_events;
create trigger reputation_events_adjust_profile after insert or delete on public.reputation_events
for each row execute function private.adjust_reputation_from_event();

create or replace function private.content_reputation_event()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_key text;v_type text;v_points integer;v_user uuid;v_id uuid;
begin
  if tg_table_name='topics' then
    v_type:='topic_created';v_points:=10;
    if tg_op='INSERT' then v_user:=new.author_id;v_id:=new.id;else v_user:=old.author_id;v_id:=old.id;end if;
    v_key:='topic:'||v_id::text;
  else
    v_type:='reply_created';v_points:=5;
    if tg_op='INSERT' then v_user:=new.author_id;v_id:=new.id;else v_user:=old.author_id;v_id:=old.id;end if;
    v_key:='post:'||v_id::text;
  end if;
  if v_user is null then return coalesce(new,old);end if;
  if tg_op='INSERT' then
    insert into public.reputation_events(user_id,actor_id,event_type,points,source_type,source_id,source_key)
    values(v_user,v_user,v_type,v_points,tg_table_name,v_id,v_key) on conflict(source_key) do nothing;
  else delete from public.reputation_events where source_key=v_key; end if;
  return coalesce(new,old);
end;$$;
revoke all on function private.content_reputation_event() from public,anon,authenticated;
drop trigger if exists topics_reputation_event on public.topics;
create trigger topics_reputation_event after insert or delete on public.topics for each row execute function private.content_reputation_event();
drop trigger if exists posts_reputation_event on public.posts;
create trigger posts_reputation_event after insert or delete on public.posts for each row execute function private.content_reputation_event();

create or replace function private.reaction_event()
returns trigger language plpgsql security definer set search_path=''
as $$
declare target_author uuid;target_topic uuid;target_post uuid;v_key text;
begin
  if tg_op='INSERT' then
    target_topic:=new.topic_id;target_post:=new.post_id;
    if new.topic_id is not null then
      select author_id into target_author from public.topics where id=new.topic_id;
      v_key:='reaction:'||new.user_id::text||':topic:'||new.topic_id::text||':'||new.type;
    else
      select author_id,topic_id into target_author,target_topic from public.posts where id=new.post_id;
      v_key:='reaction:'||new.user_id::text||':post:'||new.post_id::text||':'||new.type;
    end if;
    if target_author is not null and target_author<>new.user_id then
      insert into public.reputation_events(user_id,actor_id,event_type,points,source_type,source_id,source_key,metadata,created_at)
      values(target_author,new.user_id,'reaction_received',2,'reaction',new.id,v_key,
        jsonb_build_object('reaction',new.type,'topic_id',target_topic,'post_id',target_post),new.created_at)
      on conflict(source_key) do nothing;
      insert into public.notifications(user_id,actor_id,type,data)
      values(target_author,new.user_id,'reaction',jsonb_build_object('topic_id',target_topic,'post_id',target_post,'reaction',new.type));
    end if;
    return new;
  end if;
  if old.topic_id is not null then
    select author_id into target_author from public.topics where id=old.topic_id;
    v_key:='reaction:'||old.user_id::text||':topic:'||old.topic_id::text||':'||old.type;
  else
    select author_id into target_author from public.posts where id=old.post_id;
    v_key:='reaction:'||old.user_id::text||':post:'||old.post_id::text||':'||old.type;
  end if;
  if target_author is not null and target_author<>old.user_id then delete from public.reputation_events where source_key=v_key;end if;
  return old;
end;$$;
revoke all on function private.reaction_event() from public,anon,authenticated;

create or replace function private.validate_accepted_answer()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.accepted_answer_id is null then return new;end if;
  if not exists(select 1 from public.posts p where p.id=new.accepted_answer_id and p.topic_id=new.id)
  then raise exception 'A resposta aceita precisa pertencer a este tópico.';end if;
  return new;
end;$$;
drop trigger if exists validate_topic_accepted_answer on public.topics;
create trigger validate_topic_accepted_answer before insert or update of accepted_answer_id on public.topics
for each row execute function private.validate_accepted_answer();

create or replace function private.accepted_answer_reputation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_author uuid;v_key text;
begin
  if old.accepted_answer_id is not null and old.accepted_answer_id is distinct from new.accepted_answer_id then
    delete from public.reputation_events where source_key='accepted:'||old.accepted_answer_id::text;
  end if;
  if new.accepted_answer_id is not null and old.accepted_answer_id is distinct from new.accepted_answer_id then
    select author_id into v_author from public.posts where id=new.accepted_answer_id and topic_id=new.id;
    if v_author is not null and v_author is distinct from new.author_id then
      v_key:='accepted:'||new.accepted_answer_id::text;
      insert into public.reputation_events(user_id,actor_id,event_type,points,source_type,source_id,source_key,metadata)
      values(v_author,new.author_id,'accepted_answer',20,'post',new.accepted_answer_id,v_key,jsonb_build_object('topic_id',new.id))
      on conflict(source_key) do nothing;
      insert into public.notifications(user_id,actor_id,type,data)
      values(v_author,new.author_id,'accepted_answer',jsonb_build_object('topic_id',new.id,'post_id',new.accepted_answer_id,'message','Sua resposta foi marcada como solução.'));
    end if;
  end if;
  return new;
end;$$;
revoke all on function private.accepted_answer_reputation() from public,anon,authenticated;
drop trigger if exists accepted_answer_reputation_event on public.topics;
create trigger accepted_answer_reputation_event after update of accepted_answer_id on public.topics
for each row execute function private.accepted_answer_reputation();

update public.profiles set reputation=0;
insert into public.reputation_events(user_id,actor_id,event_type,points,source_type,source_id,source_key,created_at)
select author_id,author_id,'topic_created',10,'topics',id,'topic:'||id::text,created_at from public.topics where author_id is not null
on conflict(source_key) do nothing;
insert into public.reputation_events(user_id,actor_id,event_type,points,source_type,source_id,source_key,created_at)
select author_id,author_id,'reply_created',5,'posts',id,'post:'||id::text,created_at from public.posts where author_id is not null
on conflict(source_key) do nothing;
insert into public.reputation_events(user_id,actor_id,event_type,points,source_type,source_id,source_key,metadata,created_at)
select coalesce(t.author_id,p.author_id),r.user_id,'reaction_received',2,'reaction',r.id,
'reaction:'||r.user_id::text||':'||case when r.topic_id is not null then 'topic:'||r.topic_id::text else 'post:'||r.post_id::text end||':'||r.type,
jsonb_build_object('reaction',r.type,'topic_id',coalesce(r.topic_id,p.topic_id),'post_id',r.post_id),r.created_at
from public.reactions r left join public.topics t on t.id=r.topic_id left join public.posts p on p.id=r.post_id
where coalesce(t.author_id,p.author_id) is not null and coalesce(t.author_id,p.author_id)<>r.user_id
on conflict(source_key) do nothing;
do $$ declare r record;begin for r in select id from public.profiles loop perform private.award_gamification_badges(r.id);end loop;end $$;

create table if not exists public.tags(
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null,slug text not null unique,description text not null default '',
  created_by uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now(),
  constraint tags_name_length check(char_length(name) between 1 and 40),
  constraint tags_slug_format check(slug ~ '^[a-z0-9][a-z0-9-]{0,49}$')
);
create unique index if not exists tags_name_lower_key on public.tags(lower(name));
alter table public.tags enable row level security;
drop policy if exists "tags public read" on public.tags;
create policy "tags public read" on public.tags for select to anon,authenticated using(true);
drop policy if exists "members create tags" on public.tags;
create policy "members create tags" on public.tags for insert to authenticated
with check(created_by=(select auth.uid()) and char_length(name) between 1 and 40);
grant select on public.tags to anon,authenticated;grant insert on public.tags to authenticated;

create table if not exists public.topic_tags(
  topic_id uuid not null references public.topics(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),primary key(topic_id,tag_id)
);
alter table public.topic_tags enable row level security;
drop policy if exists "topic tags public read" on public.topic_tags;
create policy "topic tags public read" on public.topic_tags for select to anon,authenticated using(true);
drop policy if exists "topic owners add tags" on public.topic_tags;
create policy "topic owners add tags" on public.topic_tags for insert to authenticated
with check(created_by=(select auth.uid()) and exists(select 1 from public.topics t where t.id=topic_id and t.author_id=(select auth.uid())));
drop policy if exists "topic owners remove tags" on public.topic_tags;
create policy "topic owners remove tags" on public.topic_tags for delete to authenticated
using(exists(select 1 from public.topics t where t.id=topic_id and t.author_id=(select auth.uid())));
grant select on public.topic_tags to anon,authenticated;grant insert,delete on public.topic_tags to authenticated;
create index if not exists topic_tags_tag_topic_idx on public.topic_tags(tag_id,topic_id);
create index if not exists topic_tags_topic_tag_idx on public.topic_tags(topic_id,tag_id);

create table if not exists public.tag_follows(
 user_id uuid not null references public.profiles(id) on delete cascade,
 tag_id uuid not null references public.tags(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,tag_id)
);
alter table public.tag_follows enable row level security;
drop policy if exists "tag follows own read" on public.tag_follows;
create policy "tag follows own read" on public.tag_follows for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "tag follows own insert" on public.tag_follows;
create policy "tag follows own insert" on public.tag_follows for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists "tag follows own delete" on public.tag_follows;
create policy "tag follows own delete" on public.tag_follows for delete to authenticated using(user_id=(select auth.uid()));
grant select,insert,delete on public.tag_follows to authenticated;
create index if not exists tag_follows_tag_user_idx on public.tag_follows(tag_id,user_id);

create table if not exists public.profile_featured_projects(
 user_id uuid not null references public.profiles(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 sort_order smallint not null default 0 check(sort_order between 0 and 2),
 created_at timestamptz not null default now(),primary key(user_id,project_id),unique(user_id,sort_order)
);
alter table public.profile_featured_projects enable row level security;
drop policy if exists "featured projects visible" on public.profile_featured_projects;
create policy "featured projects visible" on public.profile_featured_projects for select to anon,authenticated
using(exists(select 1 from public.profiles p where p.id=user_id and (p.profile_visibility='public' or (p.profile_visibility='members' and (select auth.uid()) is not null) or p.id=(select auth.uid())))
and exists(select 1 from public.projects pr where pr.id=project_id and (pr.visibility='public' or (select auth.uid()) is not null)));
drop policy if exists "users feature projects" on public.profile_featured_projects;
create policy "users feature projects" on public.profile_featured_projects for insert to authenticated
with check(user_id=(select auth.uid()) and (
 exists(select 1 from public.projects pr where pr.id=project_id and pr.owner_id=(select auth.uid()))
 or exists(select 1 from public.project_members pm where pm.project_id=project_id and pm.user_id=(select auth.uid()) and pm.status='active')
));
drop policy if exists "users unfeature projects" on public.profile_featured_projects;
create policy "users unfeature projects" on public.profile_featured_projects for delete to authenticated using(user_id=(select auth.uid()));
grant select on public.profile_featured_projects to anon,authenticated;grant insert,delete on public.profile_featured_projects to authenticated;
create index if not exists featured_projects_project_idx on public.profile_featured_projects(project_id);

create table if not exists public.topic_view_events(
 id bigint generated by default as identity primary key,
 topic_id uuid not null references public.topics(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete set null,
 session_key text not null,view_date date not null default current_date,created_at timestamptz not null default now(),
 unique(topic_id,session_key,view_date),constraint topic_view_session_key_length check(char_length(session_key) between 8 and 128)
);
alter table public.topic_view_events enable row level security;
drop policy if exists "record topic views" on public.topic_view_events;
create policy "record topic views" on public.topic_view_events for insert to anon,authenticated
with check(user_id is null or user_id=(select auth.uid()));
grant insert on public.topic_view_events to anon,authenticated;
grant usage,select on sequence public.topic_view_events_id_seq to anon,authenticated;
create index if not exists topic_view_events_topic_created_idx on public.topic_view_events(topic_id,created_at desc);

create or replace function private.increment_topic_view()
returns trigger language plpgsql security definer set search_path=''
as $$begin update public.topics set views=coalesce(views,0)+1 where id=new.topic_id;return new;end;$$;
revoke all on function private.increment_topic_view() from public,anon,authenticated;
drop trigger if exists increment_topic_view_after_insert on public.topic_view_events;
create trigger increment_topic_view_after_insert after insert on public.topic_view_events for each row execute function private.increment_topic_view();

create or replace function public.get_community_rankings(p_period text default 'weekly',p_limit integer default 25)
returns table(user_id uuid,username text,display_name text,avatar_url text,reputation integer,level text,period_xp bigint,rank bigint)
language sql stable set search_path=''
as $$
with bounds as(
 select case when p_period='weekly' then date_trunc('week',now()) when p_period='monthly' then date_trunc('month',now()) else '1970-01-01'::timestamptz end starts_at
),scored as(
 select p.id user_id,p.username,p.display_name,p.avatar_url,p.reputation,public.reputation_level(p.reputation) level,
 coalesce(sum(e.points) filter(where e.created_at>=b.starts_at),0)::bigint period_xp
 from public.profiles p cross join bounds b left join public.reputation_events e on e.user_id=p.id
 where p.account_status='active' and (p.profile_visibility='public' or (p.profile_visibility='members' and (select auth.uid()) is not null) or p.id=(select auth.uid()))
 group by p.id,p.username,p.display_name,p.avatar_url,p.reputation
)
select s.*,dense_rank() over(order by s.period_xp desc,s.reputation desc,s.username) rank
from scored s order by rank,s.username limit greatest(1,least(coalesce(p_limit,25),100));
$$;
revoke all on function public.get_community_rankings(text,integer) from public;
grant execute on function public.get_community_rankings(text,integer) to anon,authenticated,service_role;

create or replace function public.get_personalized_feed(p_mode text default 'recommended',p_limit integer default 20,p_offset integer default 0)
returns table(id uuid,category_id uuid,category_name text,author_id uuid,author_username text,author_display_name text,author_avatar_url text,title text,content text,views integer,created_at timestamptz,updated_at timestamptz,reply_count bigint,reaction_count bigint,tags text[],score numeric)
language sql stable set search_path=''
as $$
with me as(select p.id,coalesce(p.interests,'{}'::text[]) interests from public.profiles p where p.id=(select auth.uid())),
base as(
 select t.id,t.category_id,c.name category_name,t.author_id,p.username author_username,p.display_name author_display_name,p.avatar_url author_avatar_url,
 t.title,t.content,t.views,t.created_at,t.updated_at,
 (select count(*) from public.posts po where po.topic_id=t.id) reply_count,
 (select count(*) from public.reactions r where r.topic_id=t.id) reaction_count,
 coalesce((select array_agg(tag.name order by tag.name) from public.topic_tags tt join public.tags tag on tag.id=tt.tag_id where tt.topic_id=t.id),'{}'::text[]) tags,
 exists(select 1 from public.follows f where f.follower_id=(select auth.uid()) and f.following_id=t.author_id) followed_author,
 exists(select 1 from public.topic_tags tt join public.tag_follows tf on tf.tag_id=tt.tag_id where tt.topic_id=t.id and tf.user_id=(select auth.uid())) followed_tag,
 (select count(*) from public.topic_tags tt join public.tags tag on tag.id=tt.tag_id cross join me where tt.topic_id=t.id and exists(select 1 from unnest(me.interests) interest where lower(tag.name)=lower(interest) or lower(tag.slug)=lower(regexp_replace(interest,'\s+','-','g')))) interest_tag_hits,
 (select count(*) from me,unnest(me.interests) interest where lower(c.name) like '%'||lower(interest)||'%' or lower(coalesce(c.description,'')) like '%'||lower(interest)||'%') interest_category_hits
 from public.topics t join public.categories c on c.id=t.category_id left join public.profiles p on p.id=t.author_id
 where t.author_id is null or not exists(select 1 from public.ignores i where i.blocker_id=(select auth.uid()) and i.ignored_id=t.author_id)
),scored as(
 select b.*,(case when b.followed_author then 12 else 0 end+case when b.followed_tag then 9 else 0 end+b.interest_tag_hits*7+b.interest_category_hits*5+least(b.reply_count,20)*0.35+least(b.reaction_count,20)*0.8+least(b.views,100)*0.03+greatest(0,10-extract(epoch from(now()-b.created_at))/86400.0)*0.4)::numeric score from base b
)
select s.id,s.category_id,s.category_name,s.author_id,s.author_username,s.author_display_name,s.author_avatar_url,s.title,s.content,s.views,s.created_at,s.updated_at,s.reply_count,s.reaction_count,s.tags,s.score
from scored s where case p_mode when 'following' then s.followed_author when 'community' then(s.followed_author or s.followed_tag) when 'interests' then(s.interest_tag_hits>0 or s.interest_category_hits>0) else true end
order by case when p_mode='recommended' then s.score end desc nulls last,s.updated_at desc,s.created_at desc
limit greatest(1,least(coalesce(p_limit,20),50)) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.get_personalized_feed(text,integer,integer) from public;
grant execute on function public.get_personalized_feed(text,integer,integer) to authenticated,service_role;

create or replace function public.search_forum_advanced(
 p_query text default null,p_category_id uuid default null,p_author text default null,p_date_from date default null,p_date_to date default null,p_sort text default 'relevance',p_limit integer default 30,p_offset integer default 0
)
returns table(id uuid,category_id uuid,category_name text,author_id uuid,author_username text,author_display_name text,title text,excerpt text,created_at timestamptz,updated_at timestamptz,views integer,reply_count bigint,tags text[],relevance real,total_count bigint)
language sql stable set search_path=''
as $$
with recursive category_tree as(
 select c.id from public.categories c where p_category_id is not null and c.id=p_category_id
 union all select child.id from public.categories child join category_tree parent on child.parent_id=parent.id
),filtered as(
 select t.id,t.category_id,c.name category_name,t.author_id,p.username author_username,p.display_name author_display_name,t.title,
 left(regexp_replace(t.content,'\s+',' ','g'),360) excerpt,t.created_at,t.updated_at,t.views,
 (select count(*) from public.posts po where po.topic_id=t.id) reply_count,
 coalesce((select array_agg(tag.name order by tag.name) from public.topic_tags tt join public.tags tag on tag.id=tt.tag_id where tt.topic_id=t.id),'{}'::text[]) tags,
 case when nullif(btrim(coalesce(p_query,'')),'') is null then 0::real else ts_rank(t.search_vector,websearch_to_tsquery('portuguese'::regconfig,p_query)) end relevance
 from public.topics t join public.categories c on c.id=t.category_id left join public.profiles p on p.id=t.author_id
 where (p_category_id is null or t.category_id in(select id from category_tree))
 and (nullif(btrim(coalesce(p_query,'')),'') is null or t.search_vector@@websearch_to_tsquery('portuguese'::regconfig,p_query) or t.title ilike '%'||p_query||'%' or exists(select 1 from public.topic_tags tt join public.tags tag on tag.id=tt.tag_id where tt.topic_id=t.id and tag.name ilike '%'||p_query||'%'))
 and (nullif(btrim(coalesce(p_author,'')),'') is null or coalesce(p.username,'') ilike '%'||p_author||'%' or coalesce(p.display_name,'') ilike '%'||p_author||'%')
 and(p_date_from is null or t.created_at::date>=p_date_from) and(p_date_to is null or t.created_at::date<=p_date_to)
)
select f.*,count(*) over() total_count from filtered f
order by case when p_sort='recent' then f.created_at end desc nulls last,case when p_sort='commented' then f.reply_count end desc nulls last,case when p_sort='relevance' then f.relevance end desc nulls last,f.updated_at desc
limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.search_forum_advanced(text,uuid,text,date,date,text,integer,integer) from public;
grant execute on function public.search_forum_advanced(text,uuid,text,date,date,text,integer,integer) to anon,authenticated,service_role;

create or replace function public.get_related_topics(p_topic_id uuid,p_limit integer default 6)
returns table(id uuid,title text,category_name text,author_username text,author_display_name text,shared_tags bigint,views integer,reply_count bigint)
language sql stable set search_path=''
as $$
with my_tags as(select tag_id from public.topic_tags where topic_id=p_topic_id)
select t.id,t.title,c.name,p.username,p.display_name,count(distinct tt.tag_id) shared_tags,t.views,(select count(*) from public.posts po where po.topic_id=t.id) reply_count
from public.topic_tags tt join my_tags mt on mt.tag_id=tt.tag_id join public.topics t on t.id=tt.topic_id join public.categories c on c.id=t.category_id left join public.profiles p on p.id=t.author_id
where t.id<>p_topic_id group by t.id,t.title,c.name,p.username,p.display_name,t.views,t.updated_at
order by shared_tags desc,t.updated_at desc limit greatest(1,least(coalesce(p_limit,6),20));
$$;
revoke all on function public.get_related_topics(uuid,integer) from public;
grant execute on function public.get_related_topics(uuid,integer) to anon,authenticated,service_role;

create index if not exists profiles_username_trgm_idx on public.profiles using gin(username extensions.gin_trgm_ops);
create index if not exists profiles_display_name_trgm_idx on public.profiles using gin(display_name extensions.gin_trgm_ops);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-covers','profile-covers',true,6291456,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "profile covers public read" on storage.objects;
create policy "profile covers public read" on storage.objects for select to public using(bucket_id='profile-covers');
drop policy if exists "users upload own profile covers" on storage.objects;
create policy "users upload own profile covers" on storage.objects for insert to authenticated with check(bucket_id='profile-covers' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "users update own profile covers" on storage.objects;
create policy "users update own profile covers" on storage.objects for update to authenticated
using(bucket_id='profile-covers' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='profile-covers' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "users delete own profile covers" on storage.objects;
create policy "users delete own profile covers" on storage.objects for delete to authenticated
using(bucket_id='profile-covers' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.register_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_device_id text default null,p_user_agent text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid();v_owner uuid;
begin
 if v_user is null then raise exception 'Authentication required';end if;
 if nullif(btrim(coalesce(p_endpoint,'')),'') is null or nullif(btrim(coalesce(p_p256dh,'')),'') is null or nullif(btrim(coalesce(p_auth,'')),'') is null then raise exception 'Invalid push subscription';end if;
 select user_id into v_owner from public.push_subscriptions where endpoint=p_endpoint;
 if v_owner is not null and v_owner<>v_user then raise exception 'Push endpoint already belongs to another account.';end if;
 insert into public.push_subscriptions(user_id,device_id,endpoint,p256dh,auth,user_agent,updated_at)
 values(v_user,p_device_id,p_endpoint,p_p256dh,p_auth,p_user_agent,now())
 on conflict(endpoint) do update set device_id=excluded.device_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,updated_at=now()
 where public.push_subscriptions.user_id=v_user;
end;$$;

do $$
declare fn record;
begin
 for fn in
   select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef and p.proname in(
    'create_report','delete_chat_message','edit_chat_message','log_account_event','moderate_chat_message',
    'moderate_post','moderate_topic','register_login_day','register_push_subscription','request_project_participation',
    'review_project_member','review_report','send_chat_message','send_test_notification','set_account_active','update_project_status'
   )
 loop
   execute format('revoke all on function %s from public, anon',fn.signature);
   execute format('grant execute on function %s to authenticated, service_role',fn.signature);
 end loop;
end $$;
