import { useEffect } from 'react'
import { supabase } from '../services/supabaseClient'

export function useForumRealtime(onChange) {
  useEffect(() => {
    if (!supabase) return undefined

    const channel = supabase
      .channel('forum-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, onChange)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [onChange])
}
