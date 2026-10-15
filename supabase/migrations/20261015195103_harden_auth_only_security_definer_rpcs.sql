-- Authentication-only SECURITY DEFINER RPCs must not be callable by anon.
-- Public read RPCs used by public forum/project/profile pages intentionally remain available.

revoke execute on function public.apply_project_recruiting(uuid,text,text,text) from public, anon;
grant execute on function public.apply_project_recruiting(uuid,text,text,text) to authenticated;

revoke execute on function public.create_project_recruiting_opening(uuid,text,text,text,text,text[],text,text,integer,text) from public, anon;
grant execute on function public.create_project_recruiting_opening(uuid,text,text,text,text,text[],text,text,integer,text) to authenticated;

revoke execute on function public.get_project_recruiting_applications(uuid) from public, anon;
grant execute on function public.get_project_recruiting_applications(uuid) to authenticated;

revoke execute on function public.get_devhub_language() from public, anon;
grant execute on function public.get_devhub_language() to authenticated;

revoke execute on function public.mark_forum_node_read(uuid) from public, anon;
grant execute on function public.mark_forum_node_read(uuid) to authenticated;

revoke execute on function public.set_devhub_language(text) from public, anon;
grant execute on function public.set_devhub_language(text) to authenticated;

revoke execute on function public.update_project_recruiting_opening(uuid,text,text,text,text,text[],text,text,integer,text,text) from public, anon;
grant execute on function public.update_project_recruiting_opening(uuid,text,text,text,text,text[],text,text,integer,text,text) to authenticated;

revoke execute on function public.withdraw_project_recruiting_application(uuid) from public, anon;
grant execute on function public.withdraw_project_recruiting_application(uuid) to authenticated;
