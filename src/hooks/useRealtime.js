import { useEffect } from 'react'
import { supabase } from '../services/supabaseClient'

export function useRealtime(table, callback) {
  useEffect(() => {
    const channel = supabase
      .channel(`forum-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, callback])
}
