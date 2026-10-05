import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

const chatMessageSelect = `
  id,
  user_id,
  content,
  reply_to,
  created_at,
  updated_at,
  edited_at,
  deleted_at,
  deleted_by,
  author_username,
  author_display_name,
  author_avatar_url,
  author_role,
  author:profiles!chat_messages_user_id_fkey(
    id,
    username,
    display_name,
    avatar_url,
    role,
    occupation,
    status_message,
    reputation,
    created_at
  )
`

export async function getChatMessages(limit = 120) {
  const client = requireSupabase()
  const safeLimit = Math.max(20, Math.min(200, Number(limit) || 120))
  const { data, error } = await client
    .from('chat_messages')
    .select(chatMessageSelect)
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (error) throw error
  return [...(data ?? [])].reverse()
}

export async function getChatMessage(messageId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('chat_messages')
    .select(chatMessageSelect)
    .eq('id', messageId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function sendChatMessage(content, replyTo = null) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('send_chat_message', {
    p_content: content,
    p_reply_to: replyTo || null,
  })
  if (error) throw error
  return data
}

export async function editChatMessage(messageId, content) {
  const client = requireSupabase()
  const { error } = await client.rpc('edit_chat_message', {
    p_message_id: messageId,
    p_content: content,
  })
  if (error) throw error
}

export async function deleteChatMessage(messageId) {
  const client = requireSupabase()
  const { error } = await client.rpc('delete_chat_message', {
    p_message_id: messageId,
  })
  if (error) throw error
}

export async function moderateChatMessage(messageId, action, reason = '') {
  const client = requireSupabase()
  const { error } = await client.rpc('moderate_chat_message', {
    p_message_id: messageId,
    p_action: action,
    p_reason: reason,
  })
  if (error) throw error
}

export async function getChatRestriction(userId) {
  const client = requireSupabase()
  if (!userId) return { mute: null, ban: null }

  const [muteResult, banResult] = await Promise.all([
    client
      .from('chat_mutes')
      .select('muted_until,reason,created_at')
      .eq('user_id', userId)
      .maybeSingle(),
    client
      .from('chat_bans')
      .select('banned_until,reason,created_at')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (muteResult.error) throw muteResult.error
  if (banResult.error) throw banResult.error

  return {
    mute: muteResult.data ?? null,
    ban: banResult.data ?? null,
  }
}
