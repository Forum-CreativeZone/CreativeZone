import { supabase } from './supabaseClient'

export async function uploadMedia(file, folder = 'forum-media') {
  const filename = `${Date.now()}-${file.name}`
  const { data, error } = await supabase.storage
    .from(folder)
    .upload(filename, file)

  if (error) throw error
  return data
}

export function getMediaUrl(path, folder = 'forum-media') {
  return supabase.storage.from(folder).getPublicUrl(path).data.publicUrl
}
