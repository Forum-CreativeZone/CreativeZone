create index if not exists creative_team_invites_team_idx on public.creative_team_invites(team_id);
create index if not exists creative_team_invites_invited_by_idx on public.creative_team_invites(invited_by);
create index if not exists creative_team_topics_author_idx on public.creative_team_topics(author_id);
create index if not exists creative_team_posts_author_idx on public.creative_team_posts(author_id);
