create index if not exists bookmarks_topic_id_idx on public.bookmarks(topic_id);
create index if not exists media_user_id_idx on public.media(user_id);
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_actor_id_idx on public.notifications(actor_id);
create index if not exists reactions_user_id_idx on public.reactions(user_id);
create index if not exists reactions_post_id_idx on public.reactions(post_id);
create index if not exists reactions_topic_id_idx on public.reactions(topic_id);

drop policy if exists "users update own topics" on public.topics;
create policy "users update own topics"
on public.topics
for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

drop policy if exists "users delete own topics" on public.topics;
create policy "users delete own topics"
on public.topics
for delete
to authenticated
using ((select auth.uid()) = author_id);

drop policy if exists "users update own posts" on public.posts;
create policy "users update own posts"
on public.posts
for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

drop policy if exists "users delete own posts" on public.posts;
create policy "users delete own posts"
on public.posts
for delete
to authenticated
using ((select auth.uid()) = author_id);

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications"
on public.notifications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
