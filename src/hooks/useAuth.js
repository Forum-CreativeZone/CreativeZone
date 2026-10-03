import { useEffect, useState } from 'react'
import { getSession } from '../services/authApi'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSession()
      .then(setSession)
      .finally(() => setLoading(false))
  }, [])

  return { session, loading }
}
