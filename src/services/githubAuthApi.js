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

async function invokeGitHubAuth(body) {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('github-auth', { body })
  if (error) throw await functionError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

export async function getGitHubAccountStatus() {
  return invokeGitHubAuth({ action:'status' })
}

export async function captureGitHubProviderToken() {
  const client = requireSupabase()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  const session = sessionData?.session
  const token = session?.provider_token
  if (!token) return getGitHubAccountStatus()
  return invokeGitHubAuth({
    action:'capture',
    access_token:token,
    scopes:session?.provider_refresh_token ? 'repo read:org workflow' : 'repo read:org workflow',
  })
}

export async function connectGitHubIdentity(returnTo='/projetos') {
  const client = requireSupabase()
  const redirectTo = new URL(returnTo, window.location.origin)
  redirectTo.searchParams.set('github_linked','1')
  const { data, error } = await client.auth.linkIdentity({
    provider:'github',
    options:{
      redirectTo:redirectTo.toString(),
      scopes:'repo read:org workflow',
    },
  })
  if (error) throw await functionError(error)
  if (data?.url) window.location.assign(data.url)
  return data
}

export async function reauthorizeGitHubIdentity(returnTo='/projetos') {
  const client = requireSupabase()
  const redirectTo = new URL(returnTo, window.location.origin)
  redirectTo.searchParams.set('github_linked','1')
  const { data, error } = await client.auth.signInWithOAuth({
    provider:'github',
    options:{
      redirectTo:redirectTo.toString(),
      scopes:'repo read:org workflow',
    },
  })
  if (error) throw await functionError(error)
  if (data?.url) window.location.assign(data.url)
  return data
}

export async function disconnectGitHubAccount() {
  return invokeGitHubAuth({ action:'disconnect' })
}

export async function listGitHubRepositoriesForUser() {
  return invokeGitHubAuth({ action:'repositories' })
}

export async function getCreativeZoneGitHubMembership() {
  return invokeGitHubAuth({ action:'organization_membership' })
}

export async function createGitHubRepositoryForProject(projectId, payload) {
  return invokeGitHubAuth({ action:'create_repository', project_id:projectId, ...payload })
}

export async function connectExistingGitHubRepository(projectId, fullName) {
  return invokeGitHubAuth({ action:'connect_existing', project_id:projectId, full_name:fullName })
}
