import { supabase } from './supabaseClient'

const LOCAL_TOPICS_KEY = 'forum-topics-fallback'
const LOCAL_POSTS_KEY = 'forum-posts-fallback'

function readLocal(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export async function getTopics() {
  if (!supabase) {
    return readLocal(LOCAL_TOPICS_KEY, [])
  }

  const { data, error } = await supabase
    .from('topics')
    .select(`*, categories(*), profiles(*)`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createTopic(payload) {
  if (!supabase) {
    const topic = {
      id: `local-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...payload,
    }
    const topics = readLocal(LOCAL_TOPICS_KEY, [])
    writeLocal(LOCAL_TOPICS_KEY, [topic, ...topics])
    return topic
  }

  const { data, error } = await supabase
    .from('topics')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getPosts(topicId) {
  if (!supabase) {
    const posts = readLocal(LOCAL_POSTS_KEY, [])
    return posts.filter((post) => post.topic_id === topicId)
  }

  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles(*)')
    .eq('topic_id', topicId)
    .order('created_at')

  if (error) throw error
  return data ?? []
}
