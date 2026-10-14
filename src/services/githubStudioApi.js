import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

async function functionError(error, fallback='Falha na operação.') {
  const context=error?.context
  if(context && typeof context.json==='function'){
    try{
      const response=typeof context.clone==='function' ? context.clone() : context
      const body=await response.json()
      if(body?.error) return new Error(String(body.error))
      if(body?.message) return new Error(String(body.message))
    }catch{}
  }
  return new Error(error?.message || fallback)
}

async function invokeStudio(body) {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('github-studio', { body })
  if (error) throw await functionError(error)
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

export const uploadProjectStudioFile = (projectId, payload) => invokeStudio({ action:'upload', project_id:projectId, ...payload })
export const deleteProjectStudioFile = (projectId, payload) => invokeStudio({ action:'delete_file', project_id:projectId, ...payload })
export const getProjectStudioBranches = (projectId) => invokeStudio({ action:'branches', project_id:projectId })
export const createProjectStudioBranch = (projectId, payload) => invokeStudio({ action:'create_branch', project_id:projectId, ...payload })
export const getProjectStudioCommits = (projectId, branch) => invokeStudio({ action:'commits', project_id:projectId, branch })
export const getProjectStudioIssues = (projectId, state='open') => invokeStudio({ action:'issues', project_id:projectId, state })
export const createProjectStudioIssue = (projectId, payload) => invokeStudio({ action:'create_issue', project_id:projectId, ...payload })
export const getProjectStudioPullRequests = (projectId, state='open') => invokeStudio({ action:'pull_requests', project_id:projectId, state })
export const mergeProjectStudioPullRequest = (projectId, number, mergeMethod='squash') => invokeStudio({ action:'merge_pull_request', project_id:projectId, number, merge_method:mergeMethod })
export const runProjectStudioTerminal = (projectId, command, branch) => invokeStudio({ action:'terminal', project_id:projectId, command, branch })

export const updateProjectStudioIssue = (projectId, payload) => invokeStudio({ action:'update_issue', project_id:projectId, ...payload })
export const getProjectStudioIssueComments = (projectId, number) => invokeStudio({ action:'issue_comments', project_id:projectId, number })
export const addProjectStudioIssueComment = (projectId, number, body) => invokeStudio({ action:'issue_comment', project_id:projectId, number, body })
export const getProjectStudioPullRequestReviews = (projectId, number) => invokeStudio({ action:'pr_reviews', project_id:projectId, number })
export const reviewProjectStudioPullRequest = (projectId, number, event, body='') => invokeStudio({ action:'review_pr', project_id:projectId, number, event, body })
export const getProjectStudioRepositorySettings = (projectId) => invokeStudio({ action:'repository_settings', project_id:projectId })
export const updateProjectStudioRepositorySettings = (projectId, payload) => invokeStudio({ action:'update_repository_settings', project_id:projectId, ...payload })

export const runProjectStudioCode = (projectId, payload) => invokeStudio({ action:'run_code', project_id:projectId, ...payload })

export const commitProjectStudioBatch = (projectId, payload) => invokeStudio({ action:'commit_batch', project_id:projectId, ...payload })

export const previewProjectStudioFile = (projectId, payload) => invokeStudio({ action:'preview', project_id:projectId, ...payload })
