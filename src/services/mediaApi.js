import { supabase } from './supabaseClient'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
])

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

function validateFile(file) {
  if (!file) throw new Error('Selecione um arquivo.')
  if (file.size > MAX_FILE_SIZE) throw new Error('Cada anexo pode ter no máximo 10 MB.')
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Formato não permitido. Use imagens, PDF ou arquivo de texto.')
  }
}

function cleanName(name = 'arquivo') {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-120) || 'arquivo'
}

export async function uploadForumMedia({
  file,
  userId,
  topicId = null,
  postId = null,
}) {
  validateFile(file)
  if (!userId) throw new Error('Autenticação necessária.')
  if (!topicId && !postId) throw new Error('O anexo precisa estar ligado a uma publicação.')

  const client = requireSupabase()
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${userId}/${unique}-${cleanName(file.name)}`

  const { error: uploadError } = await client.storage
    .from('forum-media')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })
  if (uploadError) throw uploadError

  const { data, error } = await client
    .from('media')
    .insert({
      user_id: userId,
      topic_id: topicId,
      post_id: postId,
      path,
      mime_type: file.type,
      original_name: file.name,
      size_bytes: file.size,
    })
    .select('*')
    .single()

  if (error) {
    await client.storage.from('forum-media').remove([path]).catch(() => {})
    throw error
  }
  return withSignedUrl(data)
}

async function withSignedUrl(item) {
  const client = requireSupabase()
  const { data, error } = await client.storage
    .from('forum-media')
    .createSignedUrl(item.path, 60 * 60)
  return {
    ...item,
    signed_url: error ? null : data?.signedUrl || null,
  }
}

export async function getTopicMedia(topicId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('media')
    .select('*')
    .eq('topic_id', topicId)
    .order('created_at')
  if (error) throw error
  return Promise.all((data ?? []).map(withSignedUrl))
}

export async function getPostMedia(postId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('media')
    .select('*')
    .eq('post_id', postId)
    .order('created_at')
  if (error) throw error
  return Promise.all((data ?? []).map(withSignedUrl))
}

export async function deleteForumMedia(item) {
  const client = requireSupabase()
  const { error: dbError } = await client.from('media').delete().eq('id', item.id)
  if (dbError) throw dbError
  await client.storage.from('forum-media').remove([item.path])
}

export function isImageMedia(item) {
  return String(item?.mime_type || '').startsWith('image/')
}
