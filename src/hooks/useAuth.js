import { useEffect, useState } from 'react'
import { getSession } from '../services/authApi'
import { supabase } from '../services/supabaseClient'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    getSession()
      .then((nextSession) => {
        if (active) setSession(nextSession)
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
