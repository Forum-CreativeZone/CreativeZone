import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

async function invokeStudio(body) {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('github-studio', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export const getProjectStudioStatus = (projectId) => invokeStudio({ action:'status', project_id:projectId })
export const getProjectStudioTree = (projectId, branch) => invokeStudio({ action:'tree', project_id:projectId, branch })
export const readProjectStudioFile = (projectId, path, branch) => invokeStudio({ action:'read', project_id:projectId, path, branch })
export const commitProjectStudioFile = (projectId, payload) => invokeStudio({ action:'commit', project_id:projectId, ...payload })
export const createProjectStudioPullRequest = (projectId, payload) => invokeStudio({ action:'pull_request', project_id:projectId, ...payload })
export const getProjectStudioCi = (projectId, branch) => invokeStudio({ action:'ci', project_id:projectId, branch })
export const getProjectSecurityFixes = (projectId) => invokeStudio({ action:'fixes', project_id:projectId })
export const createProjectSecurityFix = (projectId, vulnerabilityId) => invokeStudio({ action:'autofix', project_id:projectId, vulnerability_id:vulnerabilityId })
