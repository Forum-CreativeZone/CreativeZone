import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY).'
    )
  }
  return supabase
}

export async function getCategories() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('categories')
    .select('id, name, slug, description, icon')
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function getTopics() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('topics')
    .select('*, categories(*), profiles(*)')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  const topicIds = (data ?? []).map((topic) => topic.id)
  const replyCount = new Map()

  if (topicIds.length) {
    const { data: postRefs, error: postError } = await client
      .from('posts')
      .select('topic_id')
      .in('topic_id', topicIds)

    if (postError) throw postError

    for (const post of postRefs ?? []) {
      replyCount.set(post.topic_id, (replyCount.get(post.topic_id) ?? 0) + 1)
    }
  }

  return (data ?? []).map((topic) => ({
    ...topic,
    reply_count: replyCount.get(topic.id) ?? 0,
  }))
}

export async function createTopic(payload) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('topics')
    .insert(payload)
    .select('*, categories(*), profiles(*)')
    .single()

  if (error) throw error
  return data
}

export async function getPosts(topicId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('posts')
    .select('*, profiles(*)')
    .eq('topic_id', topicId)
    .order('created_at')

  if (error) throw error
  return data ?? []
}

export async function createPost(payload) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('posts')
    .insert(payload)
    .select('*, profiles(*)')
    .single()

  if (error) throw error
  return data
}

export async function getRecentPosts(limit = 7) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('posts')
    .select('id, topic_id, content, created_at, profiles(*), topics(id, title)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function getMembers(limit = 50) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, role, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}
