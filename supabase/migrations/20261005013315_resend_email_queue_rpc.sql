create or replace function public.get_community_email_job(p_queue_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',q.id,
    'notification_id',q.notification_id,
    'user_id',q.user_id,
    'recipient_email',q.recipient_email,
    'notification_type',q.notification_type,
    'payload',q.payload,
    'status',q.status,
    'attempts',q.attempts,
    'actor',case when a.id is null then null else jsonb_build_object(
      'id',a.id,
      'username',a.username,
      'display_name',a.display_name,
      'avatar_url',a.avatar_url
    ) end,
    'recipient',jsonb_build_object(
      'username',p.username,
      'display_name',p.display_name,
      'avatar_url',p.avatar_url
    ),
    'notification_data',n.data,
    'topic',case when t.id is null then null else jsonb_build_object(
      'id',t.id,
      'title',t.title
    ) end,
    'post',case when po.id is null then null else jsonb_build_object(
      'id',po.id,
      'content',left(po.content,500)
    ) end
  )
  from private.notification_email_queue q
  join public.notifications n on n.id=q.notification_id
  left join public.profiles a on a.id=n.actor_id
  join public.profiles p on p.id=q.user_id
  left join public.topics t on t.id=(n.data->>'topic_id')::uuid
  left join public.posts po on po.id=(n.data->>'post_id')::uuid
  where q.id=p_queue_id
  limit 1;
$$;
revoke all on function public.get_community_email_job(uuid) from public, anon, authenticated;
grant execute on function public.get_community_email_job(uuid) to service_role;

create or replace function public.mark_community_email_job(
  p_queue_id uuid,
  p_status text,
  p_provider_email_id text default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('sending','sent','failed') then
    raise exception 'Invalid email queue status';
  end if;

  update private.notification_email_queue
  set status=p_status,
      attempts=case when p_status='sending' then attempts+1 else attempts end,
      provider_email_id=coalesce(p_provider_email_id,provider_email_id),
      error_message=p_error_message,
      last_attempt_at=case when p_status='sending' then now() else last_attempt_at end,
      sent_at=case when p_status='sent' then now() else sent_at end
  where id=p_queue_id;
end;
$$;
revoke all on function public.mark_community_email_job(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.mark_community_email_job(uuid,text,text,text) to service_role;
