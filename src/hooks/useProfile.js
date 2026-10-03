import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'

export function useProfile(userId) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }

    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data }) => setProfile(data))
      .finally(() => setLoading(false))
  }, [userId])

  return { profile, loading }
}
