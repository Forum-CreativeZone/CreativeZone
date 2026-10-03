import TopicList from './TopicList'

export default function TopicSection({ topics = [], loading = false }) {
  if (loading) return <div>Carregando tópicos...</div>

  return <TopicList topics={topics} />
}
