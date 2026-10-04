import { useCallback } from 'react'
import { useForumData } from './hooks/useForumData'
import { useAuth } from './hooks/useAuth'
import { useForumRealtime } from './hooks/useForumRealtime'
import TopicCard from './components/TopicCard'
import TopicComposer from './components/TopicComposer'
import ProfileCard from './components/ProfileCard'

export default function App() {
  const { topics, loading, error, publishForumTopic, refresh } = useForumData()
  const { session } = useAuth()

  useForumRealtime(refresh)

  const handlePublish = useCallback(async (topic) => {
    await publishForumTopic(topic)
    await refresh()
  }, [publishForumTopic, refresh])

  const profile = session?.user
    ? {
        ...session.user.user_metadata,
        username: session.user.user_metadata?.username || session.user.email,
      }
    : null

  return (
    <main className="app">
      <ProfileCard profile={profile} />
      <TopicComposer onSubmit={handlePublish} />

      {error && (
        <p role="alert">Não foi possível carregar os dados online. Tente novamente em instantes.</p>
      )}

      {loading ? (
        <p>Carregando tópicos...</p>
      ) : (
        topics.map((topic) => (
          <TopicCard key={topic.id} topic={topic} />
        ))
      )}
    </main>
  )
}
