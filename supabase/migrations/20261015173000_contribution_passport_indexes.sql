create index if not exists project_activity_feed_actor_time_idx
  on public.project_activity_feed(actor_user_id,occurred_at desc)
  where actor_user_id is not null;

create index if not exists project_kanban_cards_assignee_completed_idx
  on public.project_kanban_cards(assignee_id,completed_at desc)
  where assignee_id is not null;

create index if not exists project_kanban_comments_user_time_idx
  on public.project_kanban_comments(user_id,created_at desc);

create index if not exists project_members_user_status_project_idx
  on public.project_members(user_id,status,project_id);
