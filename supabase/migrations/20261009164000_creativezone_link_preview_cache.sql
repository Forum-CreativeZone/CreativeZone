create table if not exists public.link_preview_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_url text not null unique,
  request_url text not null,
  final_url text not null,
  domain text not null,
  title text,
  description text,
  image_url text,
  logo_url text,
  publisher text,
  author text,
  published_at timestamptz,
  lang text,
  status text not null default 'ok'
    check (status in ('ok', 'minimal', 'failed')),
  http_status integer,
  content_type text,
  metadata jsonb not null default '{}'::jsonb,
  failure_reason text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint link_preview_normalized_url_length check (char_length(normalized_url) between 8 and 4096),
  constraint link_preview_request_url_length check (char_length(request_url) between 8 and 4096),
  constraint link_preview_final_url_length check (char_length(final_url) between 8 and 4096)
);

create index if not exists link_preview_cache_expires_at_idx
  on public.link_preview_cache (expires_at);

create index if not exists link_preview_cache_domain_idx
  on public.link_preview_cache (domain);

alter table public.link_preview_cache enable row level security;

revoke all on table public.link_preview_cache from anon, authenticated;
grant all on table public.link_preview_cache to service_role;

drop policy if exists "link preview cache edge only" on public.link_preview_cache;
create policy "link preview cache edge only"
on public.link_preview_cache
for all
to anon, authenticated
using (false)
with check (false);

comment on table public.link_preview_cache is
  'CreativeZone Link Preview cache. Written only by the link-preview Edge Function; clients consume previews through the function.';
