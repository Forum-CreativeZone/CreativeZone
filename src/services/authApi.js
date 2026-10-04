import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.')
  }
  return supabase
}

export async function signUp(email, password, profile = {}) {
  const client = requireSupabase()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: profile,
    },
  })

  if (error) throw error
  return data
}

export async function signIn(email, password) {
  const client = requireSupabase()
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

export async function signOut() {
  const client = requireSupabase()
  const { error } = await client.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  if (!supabase) return null

  const { data } = await supabase.auth.getSession()
  return data.session
}


async function getExternalProviders() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) return {}

  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: {
      apikey: key,
    },
  })

  if (!response.ok) {
    throw new Error('Não foi possível verificar os provedores de login do Supabase.')
  }

  const settings = await response.json()
  return settings.external || {}
}

export async function signInWithOAuthProvider(provider) {
  const client = requireSupabase()
  const label = provider === 'google' ? 'Google' : 'GitHub'
  const providers = await getExternalProviders()

  if (!providers[provider]) {
    throw new Error(
      `Login com ${label} ainda não está habilitado no Supabase. Ative o provedor em Authentication > Providers.`
    )
  }

  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/` : undefined

  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
    },
  })

  if (error) throw error
  return data
}
