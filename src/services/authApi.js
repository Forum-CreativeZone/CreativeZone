import { supabase } from './supabaseClient'

export async function signUp(email, password, profile = {}) {
  const { data, error } = await supabase.auth.signUp({
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
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}
