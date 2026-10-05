create index if not exists reputation_events_actor_id_idx on public.reputation_events(actor_id);
create index if not exists tags_created_by_idx on public.tags(created_by);
create index if not exists topic_tags_created_by_idx on public.topic_tags(created_by);
create index if not exists topic_view_events_user_id_idx on public.topic_view_events(user_id);
