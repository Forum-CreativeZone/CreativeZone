-- CreativeZone DevHub: GitHub repository intelligence, normalized OSV data and tier entitlements.
alter table public.project_repositories
 add column if not exists installation_id bigint,
 add column if not exists github_repository_id bigint,
 add column if not exists node_id text,
 add column if not exists is_private boolean not null default false,
 add column if not exists visibility text,
 add column if not exists description text,
 add column if not exists homepage_url text,
 add column if not exists owner_avatar_url text,
 add column if not exists primary_language text,
 add column if not exists stargazers_count integer not null default 0,
 add column if not exists forks_count integer not null default 0,
 add column if not exists watchers_count integer not null default 0,
 add column if not exists open_issues_count integer not null default 0,
 add column if not exists license_spdx text,
 add column if not exists topics text[] not null default '{}',
 add column if not exists pushed_at timestamptz,
 add column if not exists github_created_at timestamptz,
 add column if not exists github_updated_at timestamptz,
 add column if not exists latest_release jsonb not null default '{}'::jsonb,
 add column if not exists languages jsonb not null default '{}'::jsonb,
 add column if not exists readme_excerpt text,
 add column if not exists last_commit jsonb not null default '{}'::jsonb,
 add column if not exists actions_summary jsonb not null default '{}'::jsonb,
 add column if not exists issues_summary jsonb not null default '{}'::jsonb,
 add column if not exists pull_requests_summary jsonb not null default '{}'::jsonb,
 add column if not exists sync_status text not null default 'pending',
 add column if not exists sync_error text;

create unique index if not exists project_repositories_project_repo_uidx on public.project_repositories(project_id,lower(repo_owner),lower(repo_name));
create index if not exists project_repositories_installation_idx on public.project_repositories(installation_id);
create index if not exists project_repositories_github_id_idx on public.project_repositories(github_repository_id);
create index if not exists project_security_reports_repository_id_idx on public.project_security_reports(repository_id);

create table if not exists public.github_installations (
 installation_id bigint primary key,
 account_login text not null,
 account_id bigint,
 account_type text,
 account_avatar_url text,
 repository_selection text,
 suspended_at timestamptz,
 last_seen_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.github_installations enable row level security;

alter table public.project_github_events
 add column if not exists delivery_id text,
 add column if not exists installation_id bigint,
 add column if not exists repository_full_name text,
 add column if not exists action text,
 add column if not exists received_at timestamptz not null default now();
create unique index if not exists project_github_events_delivery_uidx on public.project_github_events(delivery_id) where delivery_id is not null;
create index if not exists project_github_events_project_created_idx on public.project_github_events(project_id,created_at desc);
create index if not exists project_github_events_repo_created_idx on public.project_github_events(lower(repository_full_name),created_at desc);

create table if not exists public.github_dependencies (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 repository_id uuid references public.project_repositories(id) on delete cascade,
 audit_id uuid references public.project_security_audits(id) on delete cascade,
 ecosystem text not null,
 package_name text not null,
 version text not null,
 purl text,
 source text,
 scope text,
 direct boolean,
 license text,
 vulnerable boolean not null default false,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.github_dependencies enable row level security;
create index if not exists github_dependencies_project_idx on public.github_dependencies(project_id);
create index if not exists github_dependencies_repository_idx on public.github_dependencies(repository_id);
create index if not exists github_dependencies_audit_idx on public.github_dependencies(audit_id);
create index if not exists github_dependencies_package_idx on public.github_dependencies(ecosystem,package_name,version);

create table if not exists public.github_vulnerabilities (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 repository_id uuid references public.project_repositories(id) on delete cascade,
 audit_id uuid references public.project_security_audits(id) on delete cascade,
 osv_id text not null,
 aliases text[] not null default '{}',
 ecosystem text not null,
 package_name text not null,
 version text not null,
 severity text not null default 'unknown',
 summary text,
 fixed_versions text[] not null default '{}',
 reference_urls jsonb not null default '[]'::jsonb,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.github_vulnerabilities enable row level security;
create index if not exists github_vulnerabilities_project_idx on public.github_vulnerabilities(project_id);
create index if not exists github_vulnerabilities_repository_idx on public.github_vulnerabilities(repository_id);
create index if not exists github_vulnerabilities_audit_idx on public.github_vulnerabilities(audit_id);
create index if not exists github_vulnerabilities_osv_idx on public.github_vulnerabilities(osv_id);

do $$ begin
 if exists(select 1 from pg_constraint where conrelid='public.project_security_audits'::regclass and conname='project_security_audits_trigger_type_check') then
   alter table public.project_security_audits drop constraint project_security_audits_trigger_type_check;
 end if;
end $$;
alter table public.project_security_audits add constraint project_security_audits_trigger_type_check
 check(trigger_type in ('automatic','manual','scheduled','push','pull_request'));

drop policy if exists "users manage own github connection" on public.github_connections;
create policy "users manage own github connection" on public.github_connections for all to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

drop policy if exists "public project repositories readable" on public.project_repositories;
drop policy if exists "project participants read repositories" on public.project_repositories;
drop policy if exists "project owners manage repositories" on public.project_repositories;
create policy "public project repositories readable" on public.project_repositories for select to anon,authenticated
 using(is_private=false and exists(select 1 from public.projects p where p.id=project_repositories.project_id and p.visibility='public'));
create policy "project participants read repositories" on public.project_repositories for select to authenticated
 using(exists(select 1 from public.projects p left join public.project_members pm on pm.project_id=p.id and pm.user_id=(select auth.uid()) and pm.status='active'
   where p.id=project_repositories.project_id and (p.owner_id=(select auth.uid()) or pm.user_id is not null)));
create policy "project owners manage repositories" on public.project_repositories for all to authenticated
 using(exists(select 1 from public.projects p where p.id=project_repositories.project_id and p.owner_id=(select auth.uid())))
 with check(exists(select 1 from public.projects p where p.id=project_repositories.project_id and p.owner_id=(select auth.uid())));

drop policy if exists "project security reports readable" on public.project_security_reports;
drop policy if exists "public project security summaries readable" on public.project_security_reports;
drop policy if exists "project participants read security reports" on public.project_security_reports;
create policy "public project security summaries readable" on public.project_security_reports for select to anon,authenticated
 using(exists(select 1 from public.projects p left join public.project_repositories pr on pr.id=project_security_reports.repository_id
   where p.id=project_security_reports.project_id and p.visibility='public' and coalesce(pr.is_private,false)=false));
create policy "project participants read security reports" on public.project_security_reports for select to authenticated
 using(exists(select 1 from public.projects p left join public.project_members pm on pm.project_id=p.id and pm.user_id=(select auth.uid()) and pm.status='active'
   where p.id=project_security_reports.project_id and (p.owner_id=(select auth.uid()) or pm.user_id is not null)));

drop policy if exists "project security events readable" on public.project_github_events;
drop policy if exists "project managers read github events" on public.project_github_events;
create policy "project managers read github events" on public.project_github_events for select to authenticated
 using(exists(select 1 from public.projects p left join public.project_members pm on pm.project_id=p.id and pm.user_id=(select auth.uid()) and pm.status='active' and pm.role in ('owner','maintainer')
   where p.id=project_github_events.project_id and (p.owner_id=(select auth.uid()) or pm.user_id is not null)));

drop policy if exists "public github dependencies readable" on public.github_dependencies;
drop policy if exists "project participants read github dependencies" on public.github_dependencies;
create policy "public github dependencies readable" on public.github_dependencies for select to anon,authenticated
 using(exists(select 1 from public.projects p left join public.project_repositories pr on pr.id=github_dependencies.repository_id
   where p.id=github_dependencies.project_id and p.visibility='public' and coalesce(pr.is_private,false)=false));
create policy "project participants read github dependencies" on public.github_dependencies for select to authenticated
 using(exists(select 1 from public.projects p left join public.project_members pm on pm.project_id=p.id and pm.user_id=(select auth.uid()) and pm.status='active'
   where p.id=github_dependencies.project_id and (p.owner_id=(select auth.uid()) or pm.user_id is not null)));

drop policy if exists "public github vulnerabilities readable" on public.github_vulnerabilities;
drop policy if exists "project participants read github vulnerabilities" on public.github_vulnerabilities;
create policy "public github vulnerabilities readable" on public.github_vulnerabilities for select to anon,authenticated
 using(exists(select 1 from public.projects p left join public.project_repositories pr on pr.id=github_vulnerabilities.repository_id
   where p.id=github_vulnerabilities.project_id and p.visibility='public' and coalesce(pr.is_private,false)=false));
create policy "project participants read github vulnerabilities" on public.github_vulnerabilities for select to authenticated
 using(exists(select 1 from public.projects p left join public.project_members pm on pm.project_id=p.id and pm.user_id=(select auth.uid()) and pm.status='active'
   where p.id=github_vulnerabilities.project_id and (p.owner_id=(select auth.uid()) or pm.user_id is not null)));

grant select on public.project_repositories,public.project_security_reports,public.github_dependencies,public.github_vulnerabilities to anon,authenticated;
grant select,insert,update,delete on public.project_repositories,public.github_connections to authenticated;
grant select on public.project_github_events to authenticated;

update public.membership_plans set description='Comunidade completa + GitHub DevHub essencial: reconhecer repositórios públicos, card GitHub, README resumido, linguagem/stars/forks, última release e verificação OSV básica com status público de vulnerabilidades.',
 entitlements=jsonb_set(entitlements,'{github_devhub}',coalesce(entitlements->'github_devhub','{}'::jsonb)||'{"repository_recognition":true,"github_card":true,"basic_repository_data":true,"readme_summary":true,"latest_release":true,"osv_basic_check":true,"public_security_status":true,"repository_limit":1,"scan_on_connect":false,"sbom":false,"dependency_graph":false,"osv_full":false,"deps_dev":false,"history":false,"scheduled_rescan":false,"commits_recent":false,"issues":false,"pull_requests":false,"actions_status":false,"languages_detailed":false,"release_history":false,"private_repository":false,"push_scan":false,"pull_request_scan":false,"real_time_alerts":false,"security_gate":false,"auto_fix":false,"project_studio":false,"forum_commits":false,"branch_pr_workflow":false,"ci_cockpit":false}'::jsonb,true),updated_at=now() where id='free';

update public.membership_plans set description='Tudo do FREE + DevHub profissional: scan completo ao conectar, SBOM, dependências diretas/transitivas, OSV detalhado, deps.dev, histórico e reanálise periódica, commits/issues/PRs, Actions, linguagens e releases avançadas.',
 entitlements=jsonb_set(entitlements,'{github_devhub}',coalesce(entitlements->'github_devhub','{}'::jsonb)||'{"repository_recognition":true,"github_card":true,"basic_repository_data":true,"readme_summary":true,"latest_release":true,"osv_basic_check":true,"public_security_status":true,"repository_limit":5,"scan_on_connect":true,"sbom":true,"dependency_graph":true,"osv_full":true,"deps_dev":true,"history":true,"scheduled_rescan":true,"commits_recent":true,"issues":true,"pull_requests":true,"actions_status":true,"languages_detailed":true,"release_history":true,"project_health":true,"private_repository":false,"push_scan":false,"pull_request_scan":false,"real_time_alerts":false,"security_gate":false,"auto_fix":false,"project_studio":false,"forum_commits":false,"branch_pr_workflow":false,"ci_cockpit":false}'::jsonb,true),updated_at=now() where id='pro';

update public.membership_plans set description='Tudo do PRO + DevHub contínuo: repositórios privados, scans em push e Pull Request, alertas em tempo real, Security Gate, AutoFix assistido, Project Studio, commits pelo fórum, fluxo branch/PR e cockpit CI/CD.',
 entitlements=jsonb_set(entitlements,'{github_devhub}',coalesce(entitlements->'github_devhub','{}'::jsonb)||'{"repository_recognition":true,"github_card":true,"basic_repository_data":true,"readme_summary":true,"latest_release":true,"osv_basic_check":true,"public_security_status":true,"repository_limit":-1,"scan_on_connect":true,"sbom":true,"dependency_graph":true,"osv_full":true,"deps_dev":true,"history":true,"scheduled_rescan":true,"commits_recent":true,"issues":true,"pull_requests":true,"actions_status":true,"languages_detailed":true,"release_history":true,"project_health":true,"private_repository":true,"push_scan":true,"pull_request_scan":true,"real_time_alerts":true,"security_gate":true,"auto_fix":true,"project_studio":true,"forum_commits":true,"branch_pr_workflow":true,"ci_cockpit":true}'::jsonb,true),updated_at=now() where id='elite';
