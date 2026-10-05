import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function createReport({ targetType, targetId, reason, details = '' }) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_report', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_details: details,
  })
  if (error) throw error
  return data
}

export async function getModerationReports(status = 'pending') {
  const client = requireSupabase()
  let query = client
    .from('reports')
    .select('*, reporter:profiles!reports_reporter_id_fkey(id,username,display_name,avatar_url), reviewer:profiles!reports_reviewed_by_fkey(id,username,display_name)')
    .order('created_at', { ascending: false })
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query.limit(100)
  if (error) throw error
  return data ?? []
}

export async function getModerationActions() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('moderation_actions')
    .select('*, moderator:profiles!moderation_actions_moderator_id_fkey(id,username,display_name)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data ?? []
}

export async function reviewReport(reportId, status, note = '') {
  const client = requireSupabase()
  const { error } = await client.rpc('review_report', {
    p_report_id: reportId,
    p_status: status,
    p_resolution_note: note,
  })
  if (error) throw error
}

export async function moderateTopic(topicId, action, reason = '') {
  const client = requireSupabase()
  const { error } = await client.rpc('moderate_topic', {
    p_topic_id: topicId,
    p_action: action,
    p_reason: reason,
  })
  if (error) throw error
}

export async function moderatePost(postId, action, reason = '') {
  const client = requireSupabase()
  const { error } = await client.rpc('moderate_post', {
    p_post_id: postId,
    p_action: action,
    p_reason: reason,
  })
  if (error) throw error
}

export async function getProjects() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('projects')
    .select('*, owner:profiles!projects_owner_id_fkey(id,username,display_name,avatar_url,occupation), project_members(user_id,role,status)')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getProject(slug) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('projects')
    .select('*, owner:profiles!projects_owner_id_fkey(id,username,display_name,avatar_url,occupation), project_members(*, profile:profiles!project_members_user_id_fkey(id,username,display_name,avatar_url,occupation)), project_updates(*, author:profiles!project_updates_author_id_fkey(id,username,display_name,avatar_url))')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createProject(payload) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('projects')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateProject(projectId, payload) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateProjectStatus(projectId, status) {
  const client = requireSupabase()
  const { error } = await client.rpc('update_project_status', {
    p_project_id: projectId,
    p_status: status,
  })
  if (error) throw error
}

export async function requestProjectParticipation(projectId, _userId, message = '') {
  const client = requireSupabase()
  const { error } = await client.rpc('request_project_participation', {
    p_project_id: projectId,
    p_message: message,
  })
  if (error) throw error
}

export async function leaveProject(projectId, userId) {
  const client = requireSupabase()
  const { error } = await client
    .from('project_members')
    .update({ status: 'left', updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function reviewProjectMember(projectId, userId, status, role = 'contributor') {
  const client = requireSupabase()
  const { error } = await client.rpc('review_project_member', {
    p_project_id: projectId,
    p_user_id: userId,
    p_status: status,
    p_role: role,
  })
  if (error) throw error
}

export async function addProjectUpdate(projectId, authorId, content) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('project_updates')
    .insert({ project_id: projectId, author_id: authorId, content })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function sendPushTestNotification() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('send_test_notification')
  if (error) throw error
  return data
}
