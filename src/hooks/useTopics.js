import { useCallback, useEffect, useState } from 'react'
import { getTopics, createTopic } from '../services/forumApi'

export function useTopics() {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setTopics(await getTopics())
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addTopic(payload) {
    const topic = await createTopic(payload)
    setTopics((items) => [topic, ...items])
    return topic
  }

  return { topics, loading, error, refresh, addTopic }
}
