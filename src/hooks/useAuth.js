import { useEffect, useState } from 'react'
import { getSession } from '../services/authApi'
import { supabase } from '../services/supabaseClient'
import { captureGitHubProviderToken } from '../services/githubAuthApi'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    getSession()
      .then((nextSession) => {
        if (active) setSession(nextSession)
        if (nextSession?.provider_token && nextSession?.user?.identities?.some?.((identity)=>identity.provider==='github')) {
          captureGitHubProviderToken().catch(()=>{})
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    if (!supabase) {
      return () => {
        active = false
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return { session, user: session?.user ?? null, loading }
}
