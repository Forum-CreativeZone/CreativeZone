export function TopicCard({ topic, onOpen }) {
  return (
    <article className="topic" onClick={() => onOpen?.(topic)}>
      <h3>{topic.title}</h3>
      <p>{topic.content || topic.description}</p>
      <small>{topic.profiles?.username || topic.user || 'Usuário'}</small>
    </article>
  )
}

export default TopicCard;
