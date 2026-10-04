create unique index if not exists reactions_unique_topic
on public.reactions(user_id, topic_id, type)
where topic_id is not null;

create unique index if not exists reactions_unique_post
on public.reactions(user_id, post_id, type)
where post_id is not null;

revoke all on public.profiles from anon;
grant select on public.profiles to anon;
revoke all on public.topics from anon;
grant select on public.topics to anon;
revoke all on public.posts from anon;
grant select on public.posts to anon;
revoke all on public.reactions from anon;
grant select on public.reactions to anon;
revoke all on public.follows from anon;
grant select on public.follows to anon;
revoke all on public.bookmarks from anon;
revoke all on public.notifications from anon;
revoke all on public.direct_messages from anon;
revoke all on public.ignores from anon;
revoke all on public.account_settings from anon;

revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (
  username, display_name, avatar_url, bio, occupation, interests,
  status_message, signature, last_seen_at, location,
  show_activity, show_online, allow_follow, show_followers, allow_dm,
  profile_completed, public_birth_day, public_birth_month, public_birth_year,
  profile_visibility
) on public.profiles to authenticated;

revoke all on public.topics from authenticated;
grant select on public.topics to authenticated;
grant insert (category_id, author_id, title, slug, content) on public.topics to authenticated;
grant update (category_id, title, slug, content) on public.topics to authenticated;
grant delete on public.topics to authenticated;

revoke all on public.posts from authenticated;
grant select on public.posts to authenticated;
grant insert (topic_id, author_id, content) on public.posts to authenticated;
grant update (content) on public.posts to authenticated;
grant delete on public.posts to authenticated;

revoke all on public.reactions from authenticated;
grant select on public.reactions to authenticated;
grant insert (user_id, post_id, topic_id, type) on public.reactions to authenticated;
grant delete on public.reactions to authenticated;

revoke all on public.bookmarks from authenticated;
grant select on public.bookmarks to authenticated;
grant insert (user_id, topic_id) on public.bookmarks to authenticated;
grant delete on public.bookmarks to authenticated;

revoke all on public.follows from authenticated;
grant select on public.follows to authenticated;
grant insert (follower_id, following_id) on public.follows to authenticated;
grant delete on public.follows to authenticated;

revoke all on public.ignores from authenticated;
grant select on public.ignores to authenticated;
grant insert (blocker_id, ignored_id) on public.ignores to authenticated;
grant delete on public.ignores to authenticated;

revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

revoke all on public.direct_messages from authenticated;
grant select on public.direct_messages to authenticated;
grant insert (sender_id, recipient_id, content) on public.direct_messages to authenticated;
grant update (read_at) on public.direct_messages to authenticated;
grant delete on public.direct_messages to authenticated;

revoke all on public.account_settings from authenticated;
grant select on public.account_settings to authenticated;
grant update (
  birth_date, location_private, theme, language, density, email_updates,
  content_filter, show_birth_day, show_birth_year, show_location
) on public.account_settings to authenticated;
