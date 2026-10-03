import { useForumData } from '../../hooks/useForumData'

export default function ForumDataBridge({ children }) {
  const forum = useForumData()

  return children({
    topics: forum.topics || [],
    loading: forum.loading,
    publishTopic: forum.publishTopic,
    refreshTopics: forum.refreshTopics,
  })
}
