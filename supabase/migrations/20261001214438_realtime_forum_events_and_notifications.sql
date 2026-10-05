-- Update timestamps automatically
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger topics_set_updated_at
before update on public.topics
for each row execute function public.set_updated_at();

create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

-- Notification when a new reply is created
create or replace function public.notify_topic_author_on_reply()
returns trigger
language plpgsql
security invoker
as $$
begin
  insert into public.notifications (user_id, actor_id, type, data)
  select
    t.author_id,
    new.author_id,
    'new_reply',
    jsonb_build_object('topic_id', new.topic_id, 'post_id', new.id)
  from public.topics t
  where t.id = new.topic_id
    and t.author_id <> new.author_id;

  return new;
end;
$$;

create trigger notify_reply_created
after insert on public.posts
for each row execute function public.notify_topic_author_on_reply();

-- Enable realtime publication for forum activity
alter publication supabase_realtime add table public.topics;
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.reactions;
