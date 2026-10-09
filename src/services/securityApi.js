import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function checkPackageSecurity({ ecosystem, packageName, version }) {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('security-audit', {
    body: {
      action: 'package',
      ecosystem,
      package_name: packageName,
      version,
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data?.result || null
}

export async function requestProjectSecurityAudit(projectId, { force = false, triggerType = 'manual' } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('security-audit', {
    body: {
      action: 'project',
      project_id: projectId,
      force,
      trigger_type: triggerType,
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data || null
}

export async function getProjectSecurityState(projectId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('project_security_state')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function getProjectSecurityAudit(projectId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('project_security_audits')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['completed', 'partial', 'failed'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function getProfileAuditedProjects(userId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_profile_audited_projects', {
    p_user_id: userId,
  })
  if (error) throw error
  return data ?? []
}

export function encodeSecurityEmbed({ ecosystem, packageName, version }) {
  return '[security:' +
    encodeURIComponent(String(ecosystem || '').trim()) + ':' +
    encodeURIComponent(String(packageName || '').trim()) + ':' +
    encodeURIComponent(String(version || '').trim()) + ']'
}

export function decodeSecurityEmbed(value) {
  const match = String(value || '').trim().match(/^\[security:([^:]+):([^:]+):([^\]]+)\]$/i)
  if (!match) return null
  try {
    return {
      ecosystem: decodeURIComponent(match[1]),
      packageName: decodeURIComponent(match[2]),
      version: decodeURIComponent(match[3]),
    }
  } catch {
    return null
  }
}
