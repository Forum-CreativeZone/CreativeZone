revoke execute on function public.get_project_permissions(uuid) from public, anon;
revoke execute on function public.get_project_team_access(uuid) from public, anon;
revoke execute on function public.set_project_member_access(uuid,uuid,text,boolean,text[]) from public, anon;
revoke execute on function public.search_project_invite_candidates(uuid,text) from public, anon;
revoke execute on function public.create_project_member_invite(uuid,uuid,text,text,boolean,text[]) from public, anon;
revoke execute on function public.respond_project_member_invite(uuid,boolean) from public, anon;
revoke execute on function public.cancel_project_member_invite(uuid) from public, anon;
revoke execute on function public.review_project_member(uuid,uuid,text,text) from public, anon;
revoke execute on function public.update_project_status(uuid,text) from public, anon;

revoke execute on function public.get_project_kanban(uuid) from public, anon;
revoke execute on function public.get_project_kanban_card(uuid) from public, anon;
revoke execute on function public.create_project_kanban_card(uuid,uuid,text,text,text,text[],uuid,timestamptz,integer,text,integer,text,text) from public, anon;
revoke execute on function public.update_project_kanban_card(uuid,text,text,text,text[],uuid,timestamptz,integer,text,integer,text,text,jsonb) from public, anon;
revoke execute on function public.move_project_kanban_card(uuid,uuid) from public, anon;
revoke execute on function public.delete_project_kanban_card(uuid) from public, anon;
revoke execute on function public.add_project_kanban_comment(uuid,text) from public, anon;

revoke execute on function public.review_project_recruiting_application(uuid,text,text) from public, anon;

grant execute on function public.get_project_permissions(uuid) to authenticated;
grant execute on function public.get_project_team_access(uuid) to authenticated;
grant execute on function public.set_project_member_access(uuid,uuid,text,boolean,text[]) to authenticated;
grant execute on function public.search_project_invite_candidates(uuid,text) to authenticated;
grant execute on function public.create_project_member_invite(uuid,uuid,text,text,boolean,text[]) to authenticated;
grant execute on function public.respond_project_member_invite(uuid,boolean) to authenticated;
grant execute on function public.cancel_project_member_invite(uuid) to authenticated;
grant execute on function public.review_project_member(uuid,uuid,text,text) to authenticated;
grant execute on function public.update_project_status(uuid,text) to authenticated;

grant execute on function public.get_project_kanban(uuid) to authenticated;
grant execute on function public.get_project_kanban_card(uuid) to authenticated;
grant execute on function public.create_project_kanban_card(uuid,uuid,text,text,text,text[],uuid,timestamptz,integer,text,integer,text,text) to authenticated;
grant execute on function public.update_project_kanban_card(uuid,text,text,text,text[],uuid,timestamptz,integer,text,integer,text,text,jsonb) to authenticated;
grant execute on function public.move_project_kanban_card(uuid,uuid) to authenticated;
grant execute on function public.delete_project_kanban_card(uuid) to authenticated;
grant execute on function public.add_project_kanban_comment(uuid,text) to authenticated;

grant execute on function public.review_project_recruiting_application(uuid,text,text) to authenticated;
