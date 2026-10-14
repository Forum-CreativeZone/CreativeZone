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

async function invokeGithub(body) {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('github-api', { body })
  if (error) throw await functionError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

export function getGitHubRepositoryCard(projectId) {
  return invokeGithub({ action: 'repo_card', project_id: projectId })
}

export function syncGitHubProject(projectId) {
  return invokeGithub({ action: 'sync_project', project_id: projectId })
}

export function getDependencyIntelligence(projectId, ecosystem, packageName, version) {
  return invokeGithub({
    action: 'dependency_intelligence',
    project_id: projectId,
    ecosystem,
    package_name: packageName,
    version,
  })
}


async function invokeGithubCommunity(body) {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('github-community', { body })
  if (error) throw await functionError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

export function getGitHubCommunityOrganization() {
  return invokeGithubCommunity({ action: 'organization' })
}

export function requestGitHubOrganizationMembership(githubUsername, message = '') {
  return invokeGithubCommunity({
    action: 'request_membership',
    github_username: githubUsername,
    message,
  })
}

export function reviewGitHubOrganizationMembership(requestId, status) {
  return invokeGithubCommunity({
    action: 'review_membership',
    request_id: requestId,
    status,
  })
}


export function sendGitHubOrganizationInvitation(requestId) {
  return invokeGithubCommunity({
    action: 'send_membership_invite',
    request_id: requestId,
  })
}


export function getGitHubRenderedReadme(projectId) {
  return invokeGithub({ action: 'readme_rendered', project_id: projectId })
}


export function getGitHubReadmeAsset(projectId,path) {
  return invokeGithub({ action:'readme_asset', project_id:projectId, path })
}
