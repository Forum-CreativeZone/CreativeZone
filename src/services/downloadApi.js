import { supabase } from './supabaseClient'

function client() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function getTopicDownloads(topicId) {
  if (!topicId) return []
  const { data, error } = await client()
    .from('topic_downloads')
    .select('id,topic_id,label,access_scope,created_by,created_at,updated_at')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createTopicDownload({ topicId, label, url, accessScope, userId }) {
  const cleanLabel = String(label || '').trim()
  const cleanUrl = String(url || '').trim()
  if (!topicId || !userId) throw new Error('Dados do download incompletos.')
  if (!cleanLabel) throw new Error('Informe um nome para o download.')
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    throw new Error('Informe um link HTTP ou HTTPS válido.')
  }
  if (!['member', 'paid'].includes(accessScope)) throw new Error('Nível de acesso inválido.')

  const { data: meta, error: metaError } = await client()
    .from('topic_downloads')
    .insert({
      topic_id: topicId,
      label: cleanLabel,
      access_scope: accessScope,
      created_by: userId,
    })
    .select('id,topic_id,label,access_scope,created_by,created_at,updated_at')
    .single()
  if (metaError) throw metaError

  const { error: targetError } = await client()
    .from('topic_download_targets')
    .insert({ download_id: meta.id, target_url: cleanUrl })
  if (targetError) {
    await client().from('topic_downloads').delete().eq('id', meta.id)
    throw targetError
  }
  return meta
}

export async function createTopicDownloads({ topicId, downloads, userId }) {
  const created = []
  for (const item of downloads || []) {
    if (!String(item?.label || '').trim() || !String(item?.url || '').trim()) continue
    created.push(await createTopicDownload({
      topicId,
      label: item.label,
      url: item.url,
      accessScope: item.accessScope || 'member',
      userId,
    }))
  }
  return created
}

export async function resolveTopicDownload(downloadId) {
  const { data, error } = await client()
    .from('topic_download_targets')
    .select('target_url')
    .eq('download_id', downloadId)
    .maybeSingle()
  if (error) throw error
  if (!data?.target_url) throw new Error('Você não possui acesso a este download.')
  return data.target_url
}

export async function updateTopicDownloadAccess(downloadId, accessScope) {
  if (!['member', 'paid'].includes(accessScope)) throw new Error('Nível de acesso inválido.')
  const { data, error } = await client()
    .from('topic_downloads')
    .update({ access_scope: accessScope, updated_at: new Date().toISOString() })
    .eq('id', downloadId)
    .select('id,topic_id,label,access_scope,created_by,created_at,updated_at')
    .single()
  if (error) throw error
  return data
}

export async function deleteTopicDownload(downloadId) {
  const { error } = await client().from('topic_downloads').delete().eq('id', downloadId)
  if (error) throw error
}
