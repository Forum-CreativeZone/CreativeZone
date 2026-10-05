create extension if not exists "uuid-ossp";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  role text not null default 'member' check (role in ('member','moderator','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  description text,
  icon text,
  created_at timestamptz not null default now()
);

create table public.topics (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references public.categories(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  slug text unique,
  content text not null,
  views integer not null default 0,
  pinned boolean not null default false,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  type text not null default 'like',
  created_at timestamptz not null default now(),
  constraint reaction_target_check check ((post_id is not null) or (topic_id is not null))
);

create table public.bookmarks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, topic_id)
);

create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  read boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.media (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  path text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create index topics_category_id_idx on public.topics(category_id);
create index topics_author_id_idx on public.topics(author_id);
create index posts_topic_id_idx on public.posts(topic_id);
create index posts_author_id_idx on public.posts(author_id);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.topics enable row level security;
alter table public.posts enable row level security;
alter table public.reactions enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notifications enable row level security;
alter table public.media enable row level security;

create policy "profiles public read" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "categories public read" on public.categories for select using (true);
create policy "topics public read" on public.topics for select using (true);
create policy "posts public read" on public.posts for select using (true);

create policy "authenticated create topics" on public.topics for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "authenticated create posts" on public.posts for insert to authenticated with check ((select auth.uid()) = author_id);

create policy "own bookmarks" on public.bookmarks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own reactions" on public.reactions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own media" on public.media for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own notifications" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
