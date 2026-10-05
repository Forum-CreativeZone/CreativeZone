import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export function normalizeTagName(value = '') {
  return String(value)
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40)
}

export function tagSlug(value = '') {
  return normalizeTagName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export async function setTopicTags(topicId, userId, names = []) {
  const client = requireSupabase()
  const normalized = [...new Set(
    (names || [])
      .map(normalizeTagName)
      .filter(Boolean)
      .slice(0, 6)
  )]
  const desired = normalized
    .map((name) => ({ name, slug: tagSlug(name) }))
    .filter((item) => item.slug)

  const { error: deleteError } = await client
    .from('topic_tags')
    .delete()
    .eq('topic_id', topicId)
  if (deleteError) throw deleteError

  if (!desired.length) return []

  const { error: tagError } = await client
    .from('tags')
    .upsert(
      desired.map((item) => ({ ...item, created_by: userId })),
      { onConflict: 'slug', ignoreDuplicates: true }
    )
  if (tagError) throw tagError

  const slugs = desired.map((item) => item.slug)
  const { data: tags, error: lookupError } = await client
    .from('tags')
    .select('id,name,slug,description')
    .in('slug', slugs)
  if (lookupError) throw lookupError

  const { error: linkError } = await client
    .from('topic_tags')
    .insert((tags || []).map((tag) => ({
      topic_id: topicId,
      tag_id: tag.id,
      created_by: userId,
    })))
  if (linkError) throw linkError

  return tags || []
}

export async function getTopicTags(topicId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('topic_tags')
    .select('tag:tags!topic_tags_tag_id_fkey(id,name,slug,description)')
    .eq('topic_id', topicId)
  if (error) throw error
  return (data || []).map((row) => row.tag).filter(Boolean)
}

export async function getTags(limit = 100) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('tags')
    .select('id,name,slug,description,created_at')
    .order('name')
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function getTagTopics(slug, limit = 50) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('topic_tags')
    .select(
      'created_at,tag:tags!inner(id,name,slug,description),topic:topics!inner(*,profiles:profiles!topics_author_id_fkey(id,username,display_name,avatar_url,reputation),categories:categories!topics_category_id_fkey(id,name,slug))'
    )
    .eq('tag.slug', slug)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return {
    tag: data?.[0]?.tag || null,
    topics: (data || []).map((row) => row.topic).filter(Boolean),
  }
}

export async function isFollowingTag(userId, tagId) {
  if (!userId || !tagId) return false
  const client = requireSupabase()
  const { data, error } = await client
    .from('tag_follows')
    .select('tag_id')
    .eq('user_id', userId)
    .eq('tag_id', tagId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function toggleTagFollow(userId, tagId) {
  const client = requireSupabase()
  const active = await isFollowingTag(userId, tagId)
  if (active) {
    const { error } = await client
      .from('tag_follows')
      .delete()
      .eq('user_id', userId)
      .eq('tag_id', tagId)
    if (error) throw error
    return false
  }

  const { error } = await client
    .from('tag_follows')
    .insert({ user_id: userId, tag_id: tagId })
  if (error) throw error
  return true
}

export async function getCommunityRankings(period = 'weekly', limit = 25) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_community_rankings', {
    p_period: period,
    p_limit: limit,
  })
  if (error) throw error
  return data || []
}

export async function getPersonalizedFeed(mode = 'recommended', limit = 20, offset = 0) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_personalized_feed', {
    p_mode: mode,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data || []
}

export async function advancedForumSearch({
  query = '',
  categoryId = null,
  author = '',
  dateFrom = null,
  dateTo = null,
  sort = 'relevance',
  limit = 30,
  offset = 0,
} = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('search_forum_advanced', {
    p_query: query.trim() || null,
    p_category_id: categoryId || null,
    p_author: author.trim() || null,
    p_date_from: dateFrom || null,
    p_date_to: dateTo || null,
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data || []
}

export async function getRelatedTopics(topicId, limit = 6) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_related_topics', {
    p_topic_id: topicId,
    p_limit: limit,
  })
  if (error) throw error
  return data || []
}

export async function markAcceptedAnswer(topicId, postId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('topics')
    .update({ accepted_answer_id: postId || null })
    .eq('id', topicId)
    .select('id,accepted_answer_id')
    .single()
  if (error) throw error
  return data
}

function getViewSessionKey() {
  const storageKey = 'creativezone-topic-view-session'
  try {
    let value = localStorage.getItem(storageKey)
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `cz-${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem(storageKey, value)
    }
    return value
  } catch {
    return globalThis.crypto?.randomUUID?.() || `cz-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

export async function recordTopicView(topicId, userId = null) {
  if (!topicId) return
  const client = requireSupabase()
  const { error } = await client
    .from('topic_view_events')
    .upsert({
      topic_id: topicId,
      user_id: userId || null,
      session_key: getViewSessionKey(),
    }, {
      onConflict: 'topic_id,session_key,view_date',
      ignoreDuplicates: true,
    })

  if (error) throw error
}

export async function getAchievementCatalog(userId = null) {
  const client = requireSupabase()
  const [{ data: badges, error: badgeError }, earnedResult, profileResult] = await Promise.all([
    client.from('badges').select('*').order('points').order('name'),
    userId
      ? client.from('user_badges').select('badge_id,awarded_at').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    userId
      ? client.from('profiles').select('id,reputation,username,display_name,avatar_url').eq('id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (badgeError) throw badgeError
  if (earnedResult.error) throw earnedResult.error
  if (profileResult.error) throw profileResult.error

  const earned = new Map((earnedResult.data || []).map((item) => [item.badge_id, item.awarded_at]))
  return {
    profile: profileResult.data || null,
    badges: (badges || []).map((badge) => ({
      ...badge,
      earned: earned.has(badge.id),
      awarded_at: earned.get(badge.id) || null,
    })),
  }
}

export async function getFeaturedProjects(userId) {
  if (!userId) return []
  const client = requireSupabase()
  const { data, error } = await client
    .from('profile_featured_projects')
    .select('sort_order,project:projects!profile_featured_projects_project_id_fkey(id,title,slug,summary,status,repo_url,website_url,tags)')
    .eq('user_id', userId)
    .order('sort_order')
  if (error) throw error
  return (data || []).map((row) => ({ ...row.project, sort_order: row.sort_order })).filter((item) => item.id)
}

export async function getEligibleFeaturedProjects(userId) {
  if (!userId) return []
  const client = requireSupabase()
  const [owned, memberships] = await Promise.all([
    client
      .from('projects')
      .select('id,title,slug,summary,status')
      .eq('owner_id', userId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false }),
    client
      .from('project_members')
      .select('project:projects!project_members_project_id_fkey(id,title,slug,summary,status)')
      .eq('user_id', userId)
      .eq('status', 'active'),
  ])
  if (owned.error) throw owned.error
  if (memberships.error) throw memberships.error
  const all = [
    ...(owned.data || []),
    ...(memberships.data || []).map((row) => row.project).filter(Boolean),
  ]
  return [...new Map(all.map((project) => [project.id, project])).values()]
}

export async function saveFeaturedProjects(userId, projectIds = []) {
  const client = requireSupabase()
  const unique = [...new Set((projectIds || []).filter(Boolean))].slice(0, 3)
  const { error: deleteError } = await client
    .from('profile_featured_projects')
    .delete()
    .eq('user_id', userId)
  if (deleteError) throw deleteError
  if (!unique.length) return []

  const { data, error } = await client
    .from('profile_featured_projects')
    .insert(unique.map((projectId, index) => ({
      user_id: userId,
      project_id: projectId,
      sort_order: index,
    })))
    .select('project_id,sort_order')
  if (error) throw error
  return data || []
}

export function reputationLevel(points = 0) {
  const value = Number(points) || 0
  if (value >= 1000) return 'Lenda'
  if (value >= 500) return 'Mestre'
  if (value >= 200) return 'Especialista'
  if (value >= 50) return 'Membro'
  return 'Novato'
}
