import { useForumData } from './hooks/useForumData'
import { useAuth } from './hooks/useAuth'
import { useForumRealtime } from './hooks/useForumRealtime'
import TopicCard from './components/TopicCard'
import TopicComposer from './components/TopicComposer'
import ProfileCard from './components/ProfileCard'

export default function App() {
  const { topics, loading, publishForumTopic, refresh } = useForumData()
  const { user } = useAuth()

  useForumRealtime(refresh)

  return (
    <main className="app">
      <ProfileCard user={user} />
      <TopicComposer onPublish={publishForumTopic} />

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
