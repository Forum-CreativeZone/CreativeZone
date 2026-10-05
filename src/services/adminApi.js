import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function getAdminDashboard(search = '', limit = 150) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_admin_dashboard', {
    p_search: search.trim(),
    p_limit: limit,
  })
  if (error) throw error
  return data || {}
}

export async function adminSetMembership({
  userId,
  planId,
  months = 1,
  permanent = false,
  requestId = null,
}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_set_membership', {
    p_user_id: userId,
    p_plan_id: planId,
    p_months: Math.max(1, Math.min(Number(months) || 1, 36)),
    p_permanent: Boolean(permanent),
    p_request_id: requestId || null,
  })
  if (error) throw error
  return data
}

export async function adminRevokeMembership(userId, reason = '') {
  const client = requireSupabase()
  const { error } = await client.rpc('admin_revoke_membership', {
    p_user_id: userId,
    p_reason: reason.trim().slice(0, 2000),
  })
  if (error) throw error
}

export async function adminUpdateMember(userId, role, accountStatus) {
  const client = requireSupabase()
  const { error } = await client.rpc('admin_update_member', {
    p_user_id: userId,
    p_role: role,
    p_account_status: accountStatus,
  })
  if (error) throw error
}

export async function adminReviewReport(reportId, status, resolutionNote = '') {
  const client = requireSupabase()
  const { error } = await client.rpc('review_report', {
    p_report_id: reportId,
    p_status: status,
    p_resolution_note: resolutionNote.trim().slice(0, 2000),
  })
  if (error) throw error
}

export async function adminReviewCategorySuggestion(suggestionId, status, note = '') {
  const client = requireSupabase()
  const { error } = await client.rpc('admin_review_category_suggestion', {
    p_suggestion_id: suggestionId,
    p_status: status,
    p_note: note.trim().slice(0, 1200),
  })
  if (error) throw error
}

export async function adminUpdateProjectStatus(projectId, status) {
  const client = requireSupabase()
  const { error } = await client.rpc('update_project_status', {
    p_project_id: projectId,
    p_status: status,
  })
  if (error) throw error
}

export async function adminRetryEmailJob(queueId) {
  const client = requireSupabase()
  const { error } = await client.rpc('admin_retry_email_job', {
    p_queue_id: queueId,
  })
  if (error) throw error
}

export function formatMoney(cents = 0, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format((Number(cents) || 0) / 100)
}
