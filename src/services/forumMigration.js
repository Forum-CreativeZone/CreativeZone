import { getTopics, createTopic, getPosts } from './forumApi'

// Bridge used while replacing prototype state with Supabase data.
export async function loadForumData() {
  const topics = await getTopics()
  return topics
}

export async function publishForumTopic(topic) {
  return createTopic(topic)
}

export async function loadTopicReplies(topicId) {
  return getPosts(topicId)
}
