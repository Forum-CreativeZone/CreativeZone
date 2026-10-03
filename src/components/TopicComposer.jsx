import { useState } from 'react'

export function TopicComposer({ onSubmit }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  async function submit(event) {
    event.preventDefault()
    await onSubmit?.({ title, content })
    setTitle('')
    setContent('')
  }

  return (
    <form onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Mensagem" />
      <button type="submit">Publicar</button>
    </form>
  )
}

export default TopicComposer;
