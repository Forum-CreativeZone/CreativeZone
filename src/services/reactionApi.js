import { supabase } from './supabaseClient'

export async function toggleReaction({ userId, topicId, type = 'like' }) {
  const { data: existing } = await supabase
    .from('reactions')
    .select('id')
    .eq('user_id', userId)
    .eq('topic_id', topicId)
    .eq('type', type)
    .maybeSingle()

  if (existing) {
    return supabase.from('reactions').delete().eq('id', existing.id)
  }

  return supabase.from('reactions').insert({
    user_id: userId,
    topic_id: topicId,
    type,
  })
}
