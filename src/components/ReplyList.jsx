export function ReplyList({ replies = [] }) {
  return (
    <section className="replies">
      {replies.map((reply) => (
        <article key={reply.id}>
          <p>{reply.content}</p>
          <small>{reply.profiles?.username || 'Usuário'}</small>
        </article>
      ))}
    </section>
  )
}
