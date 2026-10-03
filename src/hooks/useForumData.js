import { useEffect, useState } from 'react'
import { loadForumData, publishForumTopic, loadTopicReplies } from '../services/forumMigration'

export function useForumData() {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    const data = await loadForumData()
    setTopics(data)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  return { topics, loading, refresh, publishForumTopic, loadTopicReplies }
}
