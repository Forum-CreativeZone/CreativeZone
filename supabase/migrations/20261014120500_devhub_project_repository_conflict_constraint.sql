drop index if exists public.github_devhub_repositories_project_uidx;
alter table public.github_devhub_repositories
  drop constraint if exists github_devhub_repositories_project_key;
alter table public.github_devhub_repositories
  add constraint github_devhub_repositories_project_key unique(project_id);
