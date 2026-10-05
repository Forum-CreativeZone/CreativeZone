
create index if not exists category_suggestions_reviewed_by_idx
  on public.category_suggestions(reviewed_by);
