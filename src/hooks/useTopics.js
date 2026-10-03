import { useEffect, useState } from 'react'
import { getTopics } from '../services/forumApi'

export function useTopics() {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getTopics()
      .then(setTopics)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  return { topics, loading, error }
}
