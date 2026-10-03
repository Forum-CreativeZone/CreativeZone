import { getTopics, createTopic, getPosts } from './forumApi'
import { uploadMedia } from './mediaApi'

export async function loadTopics() {
  return getTopics()
}

export async function publishTopic(topic, files = []) {
  const media = []

  for (const file of files) {
    const uploaded = await uploadMedia(file)
    media.push(uploaded)
  }

  return createTopic({
    ...topic,
    media,
  })
}

export async function loadReplies(topicId) {
  return getPosts(topicId)
}
