create or replace function public.get_forum_home_stats()
returns table(
  topic_count bigint,
  post_count bigint,
  member_count bigint,
  root_category_count bigint,
  total_views bigint,
  reaction_count bigint,
  latest_member_username text,
  latest_member_display_name text,
  latest_member_avatar_url text,
  latest_member_created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with latest_member as (
    select
      p.username,
      p.display_name,
      p.avatar_url,
      p.created_at
    from public.profiles p
    where coalesce(p.account_status, 'active') = 'active'
      and p.profile_visibility = 'public'
    order by p.created_at desc
    limit 1
  )
  select
    (select count(*) from public.topics)::bigint,
    (select count(*) from public.posts)::bigint,
    (select count(*) from public.profiles p where coalesce(p.account_status, 'active') = 'active')::bigint,
    (select count(*) from public.categories c where c.parent_id is null and c.node_type = 'category')::bigint,
    coalesce((select sum(t.views)::bigint from public.topics t), 0)::bigint,
    (select count(*) from public.reactions)::bigint,
    lm.username,
    lm.display_name,
    lm.avatar_url,
    lm.created_at
  from latest_member lm
  union all
  select
    (select count(*) from public.topics)::bigint,
    (select count(*) from public.posts)::bigint,
    (select count(*) from public.profiles p where coalesce(p.account_status, 'active') = 'active')::bigint,
    (select count(*) from public.categories c where c.parent_id is null and c.node_type = 'category')::bigint,
    coalesce((select sum(t.views)::bigint from public.topics t), 0)::bigint,
    (select count(*) from public.reactions)::bigint,
    null::text,
    null::text,
    null::text,
    null::timestamptz
  where not exists (select 1 from latest_member)
  limit 1;
$$;

revoke all on function public.get_forum_home_stats() from public;
grant execute on function public.get_forum_home_stats() to anon, authenticated;
