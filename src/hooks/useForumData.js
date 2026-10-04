import { useCallback, useEffect, useState } from 'react'
import { loadForumData, publishForumTopic, loadTopicReplies } from '../services/forumMigration'

export function useForumData() {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await loadForumData()
      setTopics(data)
    } catch (err) {
      console.error('Falha ao carregar o fórum:', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { topics, loading, error, refresh, publishForumTopic, loadTopicReplies }
}
