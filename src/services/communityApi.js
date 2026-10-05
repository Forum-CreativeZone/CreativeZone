import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function getAccountSettings(userId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('account_settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error) throw error
  return data
}

export async function saveAccountProfile(userId, { profile, settings }) {
  const client = requireSupabase()
  const birth = settings.birth_date ? new Date(settings.birth_date + 'T00:00:00') : null
  const showDay = Boolean(settings.show_birth_day)
  const showYear = Boolean(settings.show_birth_year)
  const publicLocation = settings.show_location ? (settings.location_private || null) : null

  const profilePayload = {
    ...profile,
    location: publicLocation,
    public_birth_day: showDay && birth ? birth.getUTCDate() : null,
    public_birth_month: showDay && birth ? birth.getUTCMonth() + 1 : null,
    public_birth_year: showYear && birth ? birth.getUTCFullYear() : null,
  }

  const { data: nextProfile, error: profileError } = await client
    .from('profiles')
    .update(profilePayload)
    .eq('id', userId)
    .select()
    .single()
  if (profileError) throw profileError

  const { data: nextSettings, error: settingsError } = await client
    .from('account_settings')
    .update(settings)
    .eq('user_id', userId)
    .select()
    .single()
  if (settingsError) throw settingsError

  const { data: refreshedProfile, error: refreshError } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (refreshError) throw refreshError

  return { profile: refreshedProfile, settings: nextSettings }
}

export async function uploadAvatar(userId, file) {
  const client = requireSupabase()
  if (!file?.type?.startsWith('image/')) throw new Error('Selecione uma imagem válida.')
  if (file.size > 5 * 1024 * 1024) throw new Error('O avatar deve ter no máximo 5 MB.')

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${ext}`
  const { error } = await client.storage.from('avatars').upload(path, file)
  if (error) throw error

  const url = client.storage.from('avatars').getPublicUrl(path).data.publicUrl
  const { data, error: updateError } = await client
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', userId)
    .select()
    .single()
  if (updateError) throw updateError
  return data
}

export async function getPublicProfile(username) {
  const client = requireSupabase()
  const { data: profile, error } = await client
    .from('profiles')
    .select('*')
    .ilike('username', username)
    .single()
  if (error) throw error

  const [topicsRes, postsRes, followersRes, followingRes, badgesRes] = await Promise.all([
    client.from('topics').select('id,title,slug,created_at,views').eq('author_id', profile.id).order('created_at', { ascending: false }),
    client.from('posts').select('id,topic_id,content,created_at,topics(id,title)').eq('author_id', profile.id).order('created_at', { ascending: false }).limit(30),
    client.from('follows').select('follower_id').eq('following_id', profile.id),
    client.from('follows').select('following_id').eq('follower_id', profile.id),
    client.from('user_badges').select('awarded_at,badges(*)').eq('user_id', profile.id).order('awarded_at', { ascending: false }),
  ])
  for (const result of [topicsRes, postsRes, followersRes, followingRes, badgesRes]) {
    if (result.error) throw result.error
  }

  const topicIds = (topicsRes.data ?? []).map((item) => item.id)
  const postIds = (postsRes.data ?? []).map((item) => item.id)
  let reactionCount = 0
  if (topicIds.length || postIds.length) {
    const clauses = []
    if (topicIds.length) clauses.push(`topic_id.in.(${topicIds.join(',')})`)
    if (postIds.length) clauses.push(`post_id.in.(${postIds.join(',')})`)
    const { data: reactions, error: reactionError } = await client
      .from('reactions')
      .select('id')
      .or(clauses.join(','))
    if (reactionError) throw reactionError
    reactionCount = reactions?.length ?? 0
  }

  return {
    profile,
    topics: topicsRes.data ?? [],
    posts: postsRes.data ?? [],
    badges: badgesRes.data ?? [],
    stats: {
      topics: topicsRes.data?.length ?? 0,
      posts: postsRes.data?.length ?? 0,
      followers: followersRes.data?.length ?? 0,
      following: followingRes.data?.length ?? 0,
      reactions: reactionCount,
      reputation: profile.reputation ?? 0,
    },
  }
}

export async function getBookmarkIds(userId) {
  const client = requireSupabase()
  const { data, error } = await client.from('bookmarks').select('topic_id').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map((row) => row.topic_id)
}

export async function getBookmarks(userId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('bookmarks')
    .select('id,created_at,topics(*,profiles(*),categories(*))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function toggleBookmark(userId, topicId) {
  const client = requireSupabase()
  const { data: existing, error: findError } = await client
    .from('bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('topic_id', topicId)
    .maybeSingle()
  if (findError) throw findError
  if (existing) {
    const { error } = await client.from('bookmarks').delete().eq('id', existing.id)
    if (error) throw error
    return false
  }
  const { error } = await client.from('bookmarks').insert({ user_id: userId, topic_id: topicId })
  if (error) throw error
  return true
}

export async function getFollowState(userId, targetId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('follows')
    .select('follower_id')
    .eq('follower_id', userId)
    .eq('following_id', targetId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function toggleFollow(userId, targetId) {
  const client = requireSupabase()
  const following = await getFollowState(userId, targetId)
  if (following) {
    const { error } = await client.from('follows').delete()
      .eq('follower_id', userId).eq('following_id', targetId)
    if (error) throw error
    return false
  }
  const { error } = await client.from('follows').insert({ follower_id: userId, following_id: targetId })
  if (error) throw error
  return true
}

export async function getFollowing(userId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('follows')
    .select('created_at,profile:profiles!follows_following_id_fkey(*)')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getFollowers(userId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('follows')
    .select('created_at,profile:profiles!follows_follower_id_fkey(*)')
    .eq('following_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getIgnored(userId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('ignores')
    .select('ignored_id,created_at,profile:profiles!ignores_ignored_id_fkey(*)')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function toggleIgnore(userId, targetId) {
  const client = requireSupabase()
  const { data, error: findError } = await client
    .from('ignores')
    .select('blocker_id')
    .eq('blocker_id', userId)
    .eq('ignored_id', targetId)
    .maybeSingle()
  if (findError) throw findError

  if (data) {
    const { error } = await client.from('ignores').delete()
      .eq('blocker_id', userId).eq('ignored_id', targetId)
    if (error) throw error
    return false
  }

  const { error } = await client.from('ignores').insert({ blocker_id: userId, ignored_id: targetId })
  if (error) throw error
  return true
}

export async function getNotifications(userId, limit = 50) {
  const client = requireSupabase()
  const [{ data, error }, { data: settings }] = await Promise.all([
    client
      .from('notifications')
      .select('*,actor:profiles!notifications_actor_id_fkey(id,username,display_name,avatar_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    client
      .from('account_settings')
      .select('inapp_reply,inapp_mention,inapp_quote,inapp_reaction,inapp_follower,inapp_dm,inapp_moderation')
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  if (error) throw error

  const pref = {
    new_reply: settings?.inapp_reply ?? true,
    topic_watch: settings?.inapp_reply ?? true,
    mention: settings?.inapp_mention ?? true,
    quote: settings?.inapp_quote ?? true,
    reaction: settings?.inapp_reaction ?? true,
    new_follower: settings?.inapp_follower ?? true,
    direct_message: settings?.inapp_dm ?? true,
    moderation: settings?.inapp_moderation ?? true,
  }

  return (data ?? []).filter((item) => pref[item.type] ?? true)
}

export async function markNotificationRead(notificationId) {
  const client = requireSupabase()
  const { error } = await client.from('notifications')
    .update({ read: true }).eq('id', notificationId)
  if (error) throw error
}

export async function markAllNotificationsRead(userId) {
  const client = requireSupabase()
  const { error } = await client.from('notifications')
    .update({ read: true }).eq('user_id', userId).eq('read', false)
  if (error) throw error
}

export async function getMyContent(userId) {
  const client = requireSupabase()
  const [topics, posts] = await Promise.all([
    client.from('topics').select('id,title,slug,created_at,views').eq('author_id', userId).order('created_at', { ascending: false }),
    client.from('posts').select('id,topic_id,content,created_at,topics(id,title)').eq('author_id', userId).order('created_at', { ascending: false }),
  ])
  if (topics.error) throw topics.error
  if (posts.error) throw posts.error
  return { topics: topics.data ?? [], posts: posts.data ?? [] }
}

export async function getReceivedReactions(userId) {
  const client = requireSupabase()
  const [topics, posts] = await Promise.all([
    client.from('topics').select('id,title').eq('author_id', userId),
    client.from('posts').select('id,topic_id,topics(id,title)').eq('author_id', userId),
  ])
  if (topics.error) throw topics.error
  if (posts.error) throw posts.error

  const topicMap = new Map((topics.data ?? []).map((t) => [t.id, t]))
  const postMap = new Map((posts.data ?? []).map((p) => [p.id, p]))
  const clauses = []
  if (topicMap.size) clauses.push(`topic_id.in.(${[...topicMap.keys()].join(',')})`)
  if (postMap.size) clauses.push(`post_id.in.(${[...postMap.keys()].join(',')})`)
  if (!clauses.length) return []

  const { data, error } = await client
    .from('reactions')
    .select('id,type,created_at,topic_id,post_id,actor:profiles!reactions_user_id_fkey(id,username,display_name,avatar_url)')
    .or(clauses.join(','))
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map((reaction) => ({
    ...reaction,
    target: reaction.topic_id
      ? topicMap.get(reaction.topic_id)
      : postMap.get(reaction.post_id)?.topics,
  }))
}

export async function getReactionState(userId, { topicId, postId, type = 'like' }) {
  const client = requireSupabase()
  let query = client.from('reactions').select('id').eq('user_id', userId).eq('type', type)
  query = topicId ? query.eq('topic_id', topicId) : query.eq('post_id', postId)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function getReactionCount({ topicId, postId, type = 'like' }) {
  const client = requireSupabase()
  let query = client.from('reactions').select('id', { count: 'exact', head: true }).eq('type', type)
  query = topicId ? query.eq('topic_id', topicId) : query.eq('post_id', postId)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

export async function toggleReaction(userId, { topicId, postId, type = 'like' }) {
  const client = requireSupabase()
  const active = await getReactionState(userId, { topicId, postId, type })
  let query
  if (active) {
    query = client.from('reactions').delete().eq('user_id', userId).eq('type', type)
    query = topicId ? query.eq('topic_id', topicId) : query.eq('post_id', postId)
  } else {
    query = client.from('reactions').insert({
      user_id: userId,
      topic_id: topicId || null,
      post_id: postId || null,
      type,
    })
  }
  const { error } = await query
  if (error) throw error
  return !active
}

export async function getInbox(userId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('direct_messages')
    .select('*')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(250)
  if (error) throw error

  const partnerIds = [...new Set((data ?? []).map((m) => m.sender_id === userId ? m.recipient_id : m.sender_id))]
  let profiles = []
  if (partnerIds.length) {
    const result = await client.from('profiles').select('*').in('id', partnerIds)
    if (result.error) throw result.error
    profiles = result.data ?? []
  }
  const profileMap = new Map(profiles.map((p) => [p.id, p]))
  const seen = new Set()
  const conversations = []
  for (const message of data ?? []) {
    const partnerId = message.sender_id === userId ? message.recipient_id : message.sender_id
    if (seen.has(partnerId)) continue
    seen.add(partnerId)
    conversations.push({
      partner: profileMap.get(partnerId),
      lastMessage: message,
      unread: (data ?? []).filter((m) => m.sender_id === partnerId && m.recipient_id === userId && !m.read_at).length,
    })
  }
  return conversations
}

export async function getConversation(userId, otherId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('direct_messages')
    .select('*,sender:profiles!direct_messages_sender_id_fkey(id,username,display_name,avatar_url,signature)')
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${userId})`)
    .order('created_at', { ascending: true })
  if (error) throw error

  await client.from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .eq('sender_id', otherId)
    .is('read_at', null)

  return data ?? []
}

export async function sendDirectMessage(senderId, recipientId, content) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('direct_messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, content })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function touchLastSeen(userId) {
  const client = requireSupabase()
  const { error } = await client.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId)
  if (error) throw error
}

export async function linkIdentity(provider) {
  const client = requireSupabase()
  const { data, error } = await client.auth.linkIdentity({
    provider,
    options: { redirectTo: `${window.location.origin}/conta/conectadas` },
  })
  if (error) throw error
  return data
}


export async function logAccountEvent(eventType, metadata = {}) {
  const client = requireSupabase()
  const { error } = await client.rpc('log_account_event', {
    p_event_type: eventType,
    p_metadata: metadata,
  })
  if (error) throw error
}

export async function registerLoginDay() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('register_login_day')
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

function getOrCreateDeviceId() {
  const key = 'creativezone-device-id'
  let value = localStorage.getItem(key)
  if (!value) {
    value = crypto.randomUUID()
    localStorage.setItem(key, value)
  }
  return value
}

export function getCurrentDeviceId() {
  try {
    return getOrCreateDeviceId()
  } catch {
    return 'unknown-device'
  }
}

function inferDeviceName() {
  const ua = navigator.userAgent || ''
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua)
  let browser = 'Navegador'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari'
  return `${browser} · ${mobile ? 'Celular/Tablet' : 'Computador'}`
}

export async function registerDeviceSession(userId) {
  const client = requireSupabase()
  const deviceId = getCurrentDeviceId()
  const payload = {
    user_id: userId,
    device_id: deviceId,
    device_name: inferDeviceName(),
    user_agent: navigator.userAgent || '',
    last_seen_at: new Date().toISOString(),
    ended_at: null,
  }
  const { data, error } = await client
    .from('device_sessions')
    .upsert(payload, { onConflict: 'user_id,device_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getDeviceSessions(userId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('device_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function markOtherDeviceSessionsEnded(userId) {
  const client = requireSupabase()
  const currentDeviceId = getCurrentDeviceId()
  const { error } = await client
    .from('device_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', userId)
    .neq('device_id', currentDeviceId)
    .is('ended_at', null)
  if (error) throw error
}

export async function getAccountAuditLog(userId, limit = 100) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('account_audit_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function setAccountActive(active) {
  const client = requireSupabase()
  const { error } = await client.rpc('set_account_active', { p_active: active })
  if (error) throw error
}

export async function deleteMyAccount(confirmation) {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('delete-account', {
    body: { confirmation },
  })
  if (error) throw error
  if (data?.error) {
    const nextError = new Error(data.message || data.error)
    nextError.code = data.error
    throw nextError
  }
  return data
}


export async function updateAccountSettings(userId, payload) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('account_settings')
    .update(payload)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}


export async function searchDirectMessages(userId, term, limit = 100) {
  const client = requireSupabase()
  const clean = String(term || '').trim()
  if (clean.length < 2) return []

  const { data, error } = await client
    .from('direct_messages')
    .select('id,sender_id,recipient_id,content,created_at,sender:profiles!direct_messages_sender_id_fkey(id,username,display_name,avatar_url),recipient:profiles!direct_messages_recipient_id_fkey(id,username,display_name,avatar_url)')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .ilike('content', `%${clean}%`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}
