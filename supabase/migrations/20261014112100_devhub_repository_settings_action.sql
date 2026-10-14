alter table public.github_devhub_actions
  drop constraint if exists github_devhub_actions_action_type_check;

alter table public.github_devhub_actions
  add constraint github_devhub_actions_action_type_check
  check (action_type = any (array[
    'create_repo','sync','create_file','upload_file','update_file','delete_file',
    'commit','branch','pull_request','merge_pull_request','issue','issue_comment',
    'review','terminal','update_repository'
  ]::text[]));
