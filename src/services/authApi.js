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
