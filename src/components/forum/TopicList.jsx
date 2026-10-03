export default function TopicList({ topics = [], renderTopic }) {
  return (
    <section className="topic-list">
      {topics.map((topic) => renderTopic(topic))}
    </section>
  )
}
