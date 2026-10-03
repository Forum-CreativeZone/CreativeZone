import { supabase } from './supabaseClient'

export async function getTopics() {
  const { data, error } = await supabase
    .from('topics')
    .select(`*, categories(*), profiles(*)`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createTopic(payload) {
  const { data, error } = await supabase
    .from('topics')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getPosts(topicId) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles(*)')
    .eq('topic_id', topicId)
    .order('created_at')

  if (error) throw error
  return data ?? []
}
