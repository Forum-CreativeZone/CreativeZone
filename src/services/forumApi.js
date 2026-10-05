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
    .select('id, name, slug, description, icon, parent_id, node_type, sort_order')
    .order('sort_order')
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
    .select('id, username, display_name, avatar_url, bio, role, occupation, interests, status_message, reputation, last_seen_at, location, show_online, allow_dm, allow_follow, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}


export async function getTopicsPage({
  page = 1,
  pageSize = 3,
  query = '',
  categoryId = null,
  sort = 'recent',
  ignoredIds = [],
} = {}) {
  const client = requireSupabase()
  const safePage = Math.max(1, Number(page) || 1)
  const safeSize = Math.max(1, Math.min(50, Number(pageSize) || 3))
  const { data, error } = await client.rpc('get_forum_topics_page', {
    p_query: query.trim() || null,
    p_category_id: categoryId || null,
    p_sort: sort === 'popular' ? 'popular' : 'recent',
    p_limit: safeSize,
    p_offset: (safePage - 1) * safeSize,
    p_ignored_ids: ignoredIds,
  })
  if (error) throw error
  return {
    items: data ?? [],
    total: Number(data?.[0]?.total_count || 0),
  }
}

export async function getTopicById(topicId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('topics')
    .select('*, categories(*), profiles(*)')
    .eq('id', topicId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const { count, error: countError } = await client
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('topic_id', topicId)
  if (countError) throw countError
  return { ...data, reply_count: count || 0 }
}

export async function searchForum(query, { limit = 20, offset = 0 } = {}) {
  const client = requireSupabase()
  if (!query?.trim()) return []
  const { data, error } = await client.rpc('search_forum', {
    p_query: query.trim(),
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data ?? []
}

export async function updateTopic(topicId, changes) {
  const client = requireSupabase()
  const allowed = {
    title: changes.title,
    content: changes.content,
    category_id: changes.category_id,
    slug: changes.slug,
  }
  const payload = Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== undefined))
  const { data, error } = await client
    .from('topics')
    .update(payload)
    .eq('id', topicId)
    .select('*, categories(*), profiles(*)')
    .single()
  if (error) throw error
  return data
}

export async function deleteTopic(topicId) {
  const client = requireSupabase()
  const { error } = await client.from('topics').delete().eq('id', topicId)
  if (error) throw error
}

export async function updatePost(postId, content) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('posts')
    .update({ content })
    .eq('id', postId)
    .select('*, profiles(*)')
    .single()
  if (error) throw error
  return data
}

export async function deletePost(postId) {
  const client = requireSupabase()
  const { error } = await client.from('posts').delete().eq('id', postId)
  if (error) throw error
}


export async function getForumAuthorStats(authorIds = []) {
  const client = requireSupabase()
  const ids = [...new Set((authorIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const { data, error } = await client.rpc('get_forum_author_stats', {
    p_author_ids: ids,
  })
  if (error) throw error

  return Object.fromEntries((data || []).map((item) => [item.profile_id, {
    topic_count: Number(item.topic_count || 0),
    post_count: Number(item.post_count || 0),
  }]))
}

export async function isWatchingTopic(userId, topicId) {
  const client = requireSupabase()
  if (!userId || !topicId) return false
  const { data, error } = await client
    .from('topic_watches')
    .select('topic_id')
    .eq('topic_id', topicId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function watchTopic(userId, topicId) {
  const client = requireSupabase()
  const { error } = await client
    .from('topic_watches')
    .insert({ topic_id: topicId, user_id: userId })
  if (error && error.code !== '23505') throw error
}

export async function unwatchTopic(userId, topicId) {
  const client = requireSupabase()
  const { error } = await client
    .from('topic_watches')
    .delete()
    .eq('topic_id', topicId)
    .eq('user_id', userId)
  if (error) throw error
}
