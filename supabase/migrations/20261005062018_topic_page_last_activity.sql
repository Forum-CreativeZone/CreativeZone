drop function if exists public.get_forum_topics_page(text,uuid,text,integer,integer,uuid[]);

create function public.get_forum_topics_page(
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
  last_activity_at timestamptz,
  last_actor_id uuid,
  last_actor_username text,
  last_actor_display_name text,
  last_actor_avatar_url text,
  total_count bigint
)
language sql
stable
set search_path=''
as $$
  with recursive category_tree as (
    select c.id
    from public.categories c
    where p_category_id is not null and c.id=p_category_id

    union all

    select child.id
    from public.categories child
    join category_tree parent on child.parent_id=parent.id
  ),
  filtered as (
    select
      t.id,
      t.category_id,
      t.author_id,
      t.title,
      t.slug,
      t.content,
      t.views,
      t.pinned,
      t.locked,
      t.created_at,
      t.updated_at,
      c.name as category_name,
      c.slug as category_slug,
      p.username as author_username,
      p.display_name as author_display_name,
      p.avatar_url as author_avatar_url,
      p.signature as author_signature,
      (select count(*) from public.posts po where po.topic_id=t.id) as reply_count,
      latest.activity_at as last_activity_at,
      latest.actor_id as last_actor_id,
      last_actor.username as last_actor_username,
      last_actor.display_name as last_actor_display_name,
      last_actor.avatar_url as last_actor_avatar_url
    from public.topics t
    join public.categories c on c.id=t.category_id
    left join public.profiles p on p.id=t.author_id
    left join lateral (
      select activity.activity_at,activity.actor_id
      from (
        select t.created_at as activity_at,t.author_id as actor_id
        union all
        select po.created_at,po.author_id
        from public.posts po
        where po.topic_id=t.id
      ) activity
      order by activity.activity_at desc nulls last
      limit 1
    ) latest on true
    left join public.profiles last_actor on last_actor.id=latest.actor_id
    where (
      p_category_id is null
      or t.category_id in (select category_tree.id from category_tree)
    )
      and (t.author_id is null or not (t.author_id = any(coalesce(p_ignored_ids,'{}'::uuid[]))))
      and (
        nullif(btrim(coalesce(p_query,'')),'') is null
        or t.search_vector @@ websearch_to_tsquery('portuguese'::regconfig,p_query)
        or coalesce(p.display_name,'') ilike '%'||p_query||'%'
        or coalesce(p.username,'') ilike '%'||p_query||'%'
      )
  )
  select
    f.id,
    f.category_id,
    f.author_id,
    f.title,
    f.slug,
    f.content,
    f.views,
    f.pinned,
    f.locked,
    f.created_at,
    f.updated_at,
    f.category_name,
    f.category_slug,
    f.author_username,
    f.author_display_name,
    f.author_avatar_url,
    f.author_signature,
    f.reply_count,
    f.last_activity_at,
    f.last_actor_id,
    f.last_actor_username,
    f.last_actor_display_name,
    f.last_actor_avatar_url,
    count(*) over() as total_count
  from filtered f
  order by
    f.pinned desc,
    case when p_sort='popular' then f.views end desc nulls last,
    f.last_activity_at desc nulls last,
    f.created_at desc
  limit greatest(1,least(coalesce(p_limit,10),50))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.get_forum_topics_page(text,uuid,text,integer,integer,uuid[]) from public;
grant execute on function public.get_forum_topics_page(text,uuid,text,integer,integer,uuid[]) to anon,authenticated;
