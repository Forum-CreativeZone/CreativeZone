import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

async function invokeGithub(body) {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('github-api', { body })
  if (error) throw error
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
  if (error) throw error
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
