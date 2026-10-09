import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function createTopicPoll({
  topicId,
  question,
  options,
  allowMultiple = false,
  closesAt = null,
}) {
  const client = requireSupabase()
  const { error } = await client.rpc('create_topic_poll', {
    p_topic_id: topicId,
    p_question: question,
    p_options: options,
    p_allow_multiple: Boolean(allowMultiple),
    p_closes_at: closesAt || null,
  })
  if (error) throw error
}

export async function deleteTopicPoll(topicId) {
  const client = requireSupabase()
  const { error } = await client.rpc('delete_topic_poll', {
    p_topic_id: topicId,
  })
  if (error) throw error
}

export async function getTopicPoll(topicId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_topic_poll', {
    p_topic_id: topicId,
  })
  if (error) throw error
  return data || null
}

export async function voteTopicPoll(topicId, optionIds) {
  const client = requireSupabase()
  const { error } = await client.rpc('vote_topic_poll', {
    p_topic_id: topicId,
    p_option_ids: optionIds,
  })
  if (error) throw error
}
