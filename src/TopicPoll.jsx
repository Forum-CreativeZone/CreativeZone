import React, { useEffect, useMemo, useState } from 'react'
import { BarChart3, Check, Clock3, Vote } from 'lucide-react'
import { getTopicPoll, voteTopicPoll } from './services/pollApi'

function formatClose(value) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function TopicPoll({ topicId, session, notify }) {
  const [poll, setPoll] = useState(null)
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const next = await getTopicPoll(topicId)
    setPoll(next)
    setSelected((next?.options || []).filter((item) => item.selected).map((item) => item.id))
  }

  useEffect(() => {
    let active = true
    getTopicPoll(topicId)
      .then((next) => {
        if (!active) return
        setPoll(next)
        setSelected((next?.options || []).filter((item) => item.selected).map((item) => item.id))
      })
      .catch(() => {
        if (active) setPoll(null)
      })
    return () => { active = false }
  }, [topicId, session?.user?.id])

  const totalVotes = useMemo(
    () => (poll?.options || []).reduce((sum, item) => sum + Number(item.vote_count || 0), 0),
    [poll]
  )

  if (!poll) return null

  function toggleOption(optionId) {
    if (poll.closed || busy) return
    setSelected((current) => {
      if (!poll.allow_multiple) return [optionId]
      return current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
    })
  }

  async function submit(event) {
    event.preventDefault()
    if (!session?.user) {
      notify?.('Entre na sua conta para votar nesta enquete.')
      return
    }
    if (!selected.length) {
      notify?.('Escolha pelo menos uma opção.')
      return
    }

    setBusy(true)
    try {
      await voteTopicPoll(topicId, selected)
      await refresh()
      notify?.('Seu voto foi registrado.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível registrar seu voto.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="topic-poll-card" aria-label="Enquete do tópico">
      <header>
        <span className="topic-poll-icon"><BarChart3 /></span>
        <span>
          <small>ENQUETE</small>
          <strong>{poll.question}</strong>
        </span>
        {poll.closed && <b>Encerrada</b>}
      </header>

      <form onSubmit={submit}>
        <div className="topic-poll-options">
          {(poll.options || []).map((option) => {
            const count = Number(option.vote_count || 0)
            const percent = totalVotes ? Math.round((count / totalVotes) * 100) : 0
            const active = selected.includes(option.id)

            return (
              <button
                key={option.id}
                type="button"
                className={'topic-poll-option ' + (active ? 'selected' : '')}
                onClick={() => toggleOption(option.id)}
                disabled={poll.closed || busy}
              >
                <span className="topic-poll-choice">
                  <i>{active && <Check />}</i>
                  <strong>{option.label}</strong>
                </span>
                <span className="topic-poll-result">
                  <span><i style={{ width: percent + '%' }} /></span>
                  <small>{count} voto{count === 1 ? '' : 's'} · {percent}%</small>
                </span>
              </button>
            )
          })}
        </div>

        <footer>
          <span>
            <Vote />
            {poll.total_voters || 0} participante{Number(poll.total_voters || 0) === 1 ? '' : 's'}
            {poll.allow_multiple ? ' · múltipla escolha' : ' · escolha única'}
          </span>
          {poll.closes_at && (
            <span><Clock3 /> {poll.closed ? 'Encerrada em ' : 'Encerra em '}{formatClose(poll.closes_at)}</span>
          )}
          {!poll.closed && (
            <button className="action primary-action" disabled={busy || !selected.length}>
              {busy ? 'Registrando...' : 'Votar'}
            </button>
          )}
        </footer>
      </form>
    </section>
  )
}
