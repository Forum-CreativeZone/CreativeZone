alter table public.media
  add column if not exists topic_id uuid references public.topics(id) on delete cascade,
  add column if not exists post_id uuid references public.posts(id) on delete cascade,
  add column if not exists original_name text,
  add column if not exists size_bytes bigint;

do $$ begin
  alter table public.media add constraint media_target_check
  check (
    (topic_id is not null and post_id is null)
    or (topic_id is null and post_id is not null)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.media add constraint media_size_check
  check (size_bytes is null or (size_bytes >= 0 and size_bytes <= 10485760));
exception when duplicate_object then null; end $$;

create index if not exists media_topic_idx on public.media(topic_id);
create index if not exists media_post_idx on public.media(post_id);

drop policy if exists "own media" on public.media;
drop policy if exists "forum media public read" on public.media;
drop policy if exists "users insert own forum media" on public.media;
drop policy if exists "users delete own forum media" on public.media;

create policy "forum media public read"
on public.media for select using (true);

create policy "users insert own forum media"
on public.media for insert to authenticated
with check (
  user_id=(select auth.uid())
  and (
    (topic_id is not null and exists(select 1 from public.topics t where t.id=topic_id and t.author_id=(select auth.uid())))
    or
    (post_id is not null and exists(select 1 from public.posts p where p.id=post_id and p.author_id=(select auth.uid())))
  )
);

create policy "users delete own forum media"
on public.media for delete to authenticated
using (user_id=(select auth.uid()));

drop policy if exists "Authenticated media read" on storage.objects;
drop policy if exists "Public forum media read" on storage.objects;
create policy "Public forum media read"
on storage.objects for select
using (bucket_id='forum-media');

drop policy if exists "Authenticated media upload" on storage.objects;
create policy "Authenticated media upload"
on storage.objects for insert to authenticated
with check (
  bucket_id='forum-media'
  and owner_id=(select auth.uid()::text)
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);

drop policy if exists "Authenticated media delete" on storage.objects;
create policy "Authenticated media delete"
on storage.objects for delete to authenticated
using (
  bucket_id='forum-media'
  and owner_id=(select auth.uid()::text)
);

alter table public.topics
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('portuguese'::regconfig,coalesce(title,'')),'A')
    || setweight(to_tsvector('portuguese'::regconfig,coalesce(content,'')),'B')
  ) stored;

alter table public.posts
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('portuguese'::regconfig,coalesce(content,''))
  ) stored;

create index if not exists topics_search_vector_idx on public.topics using gin(search_vector);
create index if not exists posts_search_vector_idx on public.posts using gin(search_vector);

create or replace function public.get_forum_topics_page(
  p_query text default null,
  p_category_id uuid default null,
  p_sort text default 'recent',
  p_limit integer default 10,
  p_offset integer default 0,
  p_ignored_ids uuid[] default '{}'::uuid[]
)
returns table(
  id uuid,
  category_id uuid,
  author_id uuid,
  title text,
  slug text,
  content text,
  views integer,
  pinned boolean,
  locked boolean,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  category_slug text,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  author_signature text,
  reply_count bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path=''
as $$
  with filtered as (
    select
      t.*,
      c.name as category_name,
      c.slug as category_slug,
      p.username as author_username,
      p.display_name as author_display_name,
      p.avatar_url as author_avatar_url,
      p.signature as author_signature,
      (select count(*) from public.posts po where po.topic_id=t.id) as reply_count
    from public.topics t
    join public.categories c on c.id=t.category_id
    left join public.profiles p on p.id=t.author_id
    where (p_category_id is null or t.category_id=p_category_id)
      and (t.author_id is null or not (t.author_id = any(coalesce(p_ignored_ids,'{}'::uuid[]))))
      and (
        nullif(btrim(coalesce(p_query,'')),'') is null
        or t.search_vector @@ websearch_to_tsquery('portuguese'::regconfig,p_query)
        or coalesce(p.display_name,'') ilike '%'||p_query||'%'
        or coalesce(p.username,'') ilike '%'||p_query||'%'
      )
  )
  select
    f.id,f.category_id,f.author_id,f.title,f.slug,f.content,f.views,f.pinned,f.locked,
    f.created_at,f.updated_at,f.category_name,f.category_slug,f.author_username,
    f.author_display_name,f.author_avatar_url,f.author_signature,f.reply_count,
    count(*) over() as total_count
  from filtered f
  order by
    f.pinned desc,
    case when p_sort='popular' then f.views end desc nulls last,
    f.created_at desc
  limit greatest(1,least(coalesce(p_limit,10),50))
  offset greatest(coalesce(p_offset,0),0);
$$;

grant execute on function public.get_forum_topics_page(text,uuid,text,integer,integer,uuid[]) to anon,authenticated;

create or replace function public.search_forum(
  p_query text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  result_type text,
  id uuid,
  topic_id uuid,
  title text,
  excerpt text,
  author_username text,
  author_display_name text,
  created_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path=''
as $$
  with q as (select websearch_to_tsquery('portuguese'::regconfig,coalesce(p_query,'')) query),
  topic_hits as (
    select 'topic'::text result_type,t.id,t.id topic_id,t.title,
           left(t.content,260) excerpt,p.username,p.display_name,t.created_at,
           ts_rank_cd(t.search_vector,q.query)::real rank
    from public.topics t
    left join public.profiles p on p.id=t.author_id
    cross join q
    where nullif(btrim(coalesce(p_query,'')),'') is not null
      and (t.search_vector @@ q.query or coalesce(p.username,'') ilike '%'||p_query||'%' or coalesce(p.display_name,'') ilike '%'||p_query||'%')
  ),
  post_hits as (
    select 'post'::text result_type,po.id,po.topic_id,t.title,
           left(po.content,260) excerpt,p.username,p.display_name,po.created_at,
           ts_rank_cd(po.search_vector,q.query)::real rank
    from public.posts po
    join public.topics t on t.id=po.topic_id
    left join public.profiles p on p.id=po.author_id
    cross join q
    where nullif(btrim(coalesce(p_query,'')),'') is not null
      and po.search_vector @@ q.query
  )
  select * from (
    select * from topic_hits
    union all
    select * from post_hits
  ) hits
  order by rank desc,created_at desc
  limit greatest(1,least(coalesce(p_limit,20),50))
  offset greatest(coalesce(p_offset,0),0);
$$;

grant execute on function public.search_forum(text,integer,integer) to anon,authenticated;

create or replace function public.send_test_notification()
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.notifications(user_id,actor_id,type,data)
  values(v_user,null,'moderation',jsonb_build_object('message','Teste de notificações da CreativeZone','push_test',true))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.send_test_notification() from public,anon;
grant execute on function public.send_test_notification() to authenticated;

grant select,insert,delete on public.media to authenticated;
grant select on public.media to anon;
