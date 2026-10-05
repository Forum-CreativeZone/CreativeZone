-- Create profile automatically after Supabase Auth user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, created_at, updated_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Initial forum categories
insert into public.categories (name, slug, description)
values
('Hardware', 'hardware', 'Discussão sobre componentes, PCs e equipamentos'),
('Software', 'software', 'Sistemas, aplicativos e desenvolvimento'),
('Games', 'games', 'Jogos, consoles e comunidade gamer'),
('Tecnologia', 'tecnologia', 'Novidades e tendências tecnológicas'),
('Off Topic', 'off-topic', 'Conversas gerais da comunidade')
on conflict (slug) do nothing;

-- Helpful indexes
create index if not exists topics_category_id_idx on public.topics(category_id);
create index if not exists topics_author_id_idx on public.topics(author_id);
create index if not exists posts_topic_id_idx on public.posts(topic_id);
create index if not exists posts_author_id_idx on public.posts(author_id);
