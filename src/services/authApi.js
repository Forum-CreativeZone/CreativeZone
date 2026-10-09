import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.')
  }
  return supabase
}

const OFFICIAL_SITE_URL = 'https://forum.creativezone.pro'

function getAuthRedirectOrigin() {
  if (typeof window === 'undefined') return OFFICIAL_SITE_URL
  const origin = String(window.location.origin || '').replace(/\/+$/, '')
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin)) return origin
  return OFFICIAL_SITE_URL
}

async function sha1Hex(value) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Seu navegador não oferece suporte à verificação segura de senha.')
  }

  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

export function validatePasswordStrength(password) {
  const value = String(password || '')
  if (value.length < 10) throw new Error('A senha precisa ter pelo menos 10 caracteres.')
  if (value.length > 128) throw new Error('A senha deve ter no máximo 128 caracteres.')

  const groups = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /[0-9]/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length

  if (groups < 3) {
    throw new Error('Use pelo menos 3 tipos de caracteres: minúsculas, maiúsculas, números e símbolos.')
  }
  return true
}

export async function checkLeakedPassword(password) {
  const hash = await sha1Hex(password)
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)

  let response
  try {
    response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'Add-Padding': 'true',
      },
    })
  } catch {
    throw new Error(
      'Não foi possível verificar a segurança da senha agora. Tente novamente em instantes.'
    )
  }

  if (!response.ok) {
    throw new Error(
      'Não foi possível verificar a segurança da senha agora. Tente novamente em instantes.'
    )
  }

  const body = await response.text()
  const match = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [candidateSuffix, count] = line.split(':')
      return {
        suffix: candidateSuffix?.trim().toUpperCase(),
        count: Number(count || 0),
      }
    })
    .find((entry) => entry.suffix === suffix && entry.count > 0)

  return {
    leaked: Boolean(match),
    count: match?.count || 0,
  }
}

// Compatibility for the current registration form. The real validation remains
// centralized in checkLeakedPassword/signUp so direct Auth calls cannot bypass it.
globalThis.checkCompromisedPassword = async (password) => {
  const result = await checkLeakedPassword(password)
  return result.leaked
}

export async function signUp(emailOrOptions, passwordArg, profileArg = {}) {
  const client = requireSupabase()
  const optionsMode = emailOrOptions && typeof emailOrOptions === 'object'
  const email = optionsMode ? emailOrOptions.email : emailOrOptions
  const password = optionsMode ? emailOrOptions.password : passwordArg
  const profile = optionsMode
    ? {
        username: emailOrOptions.username,
        display_name: emailOrOptions.displayName || emailOrOptions.display_name,
      }
    : profileArg

  validatePasswordStrength(password)

  const passwordCheck = await checkLeakedPassword(password)
  if (passwordCheck.leaked) {
    const error = new Error(
      'Esta senha foi bloqueada porque já apareceu em vazamentos de dados conhecidos. Escolha uma senha nova, exclusiva e que você não use em outros sites.'
    )
    error.code = 'creativezone_leaked_password'
    error.exposureCount = passwordCheck.count
    throw error
  }

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: profile,
      emailRedirectTo: `${getAuthRedirectOrigin()}/`,
    },
  })

  if (error) throw error
  return data
}

export async function signIn(emailOrOptions, passwordArg) {
  const client = requireSupabase()
  const optionsMode = emailOrOptions && typeof emailOrOptions === 'object'
  const email = optionsMode ? emailOrOptions.email : emailOrOptions
  const password = optionsMode ? emailOrOptions.password : passwordArg

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

export async function signOut() {
  const client = requireSupabase()
  const { error } = await client.auth.signOut({ scope: 'local' })
  if (error) throw error
}

export async function signOutOtherSessions() {
  const client = requireSupabase()
  const { error } = await client.auth.signOut({ scope: 'others' })
  if (error) throw error
}

export async function requestReauthentication() {
  const client = requireSupabase()
  const { error } = await client.auth.reauthenticate()
  if (error) throw error
}

export async function updateAccountEmail(email, nonce) {
  const client = requireSupabase()
  const { data, error } = await client.auth.updateUser({
    email,
    ...(nonce ? { nonce } : {}),
  })
  if (error) throw error
  return data
}

export async function updateAccountPassword(password, nonce) {
  const client = requireSupabase()
  validatePasswordStrength(password)
  const passwordCheck = await checkLeakedPassword(password)

  if (passwordCheck.leaked) {
    const error = new Error(
      'Esta senha foi bloqueada porque já apareceu em vazamentos de dados conhecidos. Escolha uma senha nova, exclusiva e que você não use em outros sites.'
    )
    error.code = 'creativezone_leaked_password'
    throw error
  }

  const { data, error } = await client.auth.updateUser({
    password,
    ...(nonce ? { nonce } : {}),
  })
  if (error) throw error
  return data
}

export async function requestPasswordReset(email) {
  const client = requireSupabase()
  const redirectTo = `${getAuthRedirectOrigin()}/redefinir-senha`

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo,
  })
  if (error) throw error
}

export async function updateRecoveredPassword(password) {
  const client = requireSupabase()
  validatePasswordStrength(password)
  const passwordCheck = await checkLeakedPassword(password)

  if (passwordCheck.leaked) {
    const error = new Error(
      'Esta senha foi bloqueada porque já apareceu em vazamentos de dados conhecidos. Escolha uma senha nova, exclusiva e que você não use em outros sites.'
    )
    error.code = 'creativezone_leaked_password'
    throw error
  }

  const { data, error } = await client.auth.updateUser({ password })
  if (error) throw error
  return data
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

  const redirectTo = `${getAuthRedirectOrigin()}/`

  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
    },
  })

  if (error) throw error
  return data
}

export function getAuthErrorMessage(error) {
  if (!error) return 'Não foi possível concluir a autenticação.'

  if (error.code === 'creativezone_weak_password') {
    return 'Use uma senha com pelo menos 10 caracteres.'
  }

  if (error.code === 'creativezone_leaked_password') {
    return 'Esta senha foi bloqueada porque já apareceu em vazamentos de dados conhecidos. Escolha uma senha nova, exclusiva e que você não use em outros sites.'
  }

  if (error.code === 'weak_password' || error.name === 'AuthWeakPasswordError') {
    const reasons = Array.isArray(error.reasons) ? error.reasons.map(String) : []
    const reasonText = [
      ...reasons,
      error.message || '',
    ].join(' ').toLowerCase()

    const leaked =
      reasonText.includes('pwned') ||
      reasonText.includes('leak') ||
      reasonText.includes('compromis')

    if (leaked) {
      return 'Esta senha foi bloqueada porque já apareceu em vazamentos de dados conhecidos. Escolha uma senha nova, exclusiva e que você não use em outros sites.'
    }

    return 'Esta senha foi bloqueada por não atender aos critérios de segurança. Escolha uma senha mais forte e exclusiva.'
  }

  if (error.code === 'invalid_credentials') {
    return 'E-mail ou senha inválidos.'
  }

  if (error.code === 'email_not_confirmed') {
    return 'Este e-mail ainda não está confirmado.'
  }

  if (error.code === 'over_request_rate_limit') {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
  }

  return error.message || 'Não foi possível concluir a autenticação.'
}
