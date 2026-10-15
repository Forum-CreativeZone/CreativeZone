alter table public.project_member_invites
  drop constraint if exists project_member_invites_project_id_invited_user_id_status_key;

create unique index if not exists project_member_invites_one_pending_idx
  on public.project_member_invites(project_id,invited_user_id)
  where status='pending';
