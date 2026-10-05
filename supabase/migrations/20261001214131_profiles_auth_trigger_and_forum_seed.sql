create or replace function public.handle_new_user()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.categories (name, slug, description)
values
('Hardware', 'hardware', 'Discussões sobre componentes, PCs e equipamentos.'),
('Software', 'software', 'Sistemas, aplicativos e desenvolvimento.'),
('Games', 'games', 'Jogos, consoles e comunidade gamer.'),
('Tecnologia', 'tecnologia', 'Notícias e tendências de tecnologia.'),
('Off Topic', 'off-topic', 'Assuntos gerais da comunidade.'),
('Dúvidas', 'duvidas', 'Ajuda e perguntas da comunidade.')
on conflict (slug) do nothing;
