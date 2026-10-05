import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  ChevronDown,
  ChevronUp,
  Edit3,
  Flag,
  Maximize2,
  MessageCircle,
  MessageSquarePlus,
  Minimize2,
  MoreVertical,
  Reply,
  Send,
  Smile,
  Trash2,
  VolumeX,
  X,
} from 'lucide-react'
import { supabase } from './services/supabaseClient'
import {
  deleteChatMessage,
  editChatMessage,
  getChatMessage,
  getChatMessages,
  getChatRestriction,
  moderateChatMessage,
  sendChatMessage,
} from './services/chatApi'
import { ReportButton } from './ExtendedCommunityPages'

const EMOJIS = ['😀','😄','😂','🙂','😉','😍','🤔','😎','🥳','😅','😭','😡','👍','👎','👏','🙌','🔥','❤️','💡','🚀','✅','🎮','💻','🤖']

function formatTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function roleLabel(role) {
  if (role === 'admin') return 'ADMIN'
  if (role === 'moderator') return 'MOD'
  return null
}

function ChatText({ text = '', navigate }) {
  const parts = String(text).split(/(https?:\/\/[^\s]+|@[A-Za-z0-9_.-]{3,50})/g)

  return (
    <>
      {parts.map((part, index) => {
        if (/^https?:\/\//i.test(part)) {
          return (
            <a
              key={part + index}
              href={part}
              target="_blank"
              rel="noreferrer noopener"
              className="community-chat-link"
            >
              {part}
            </a>
          )
        }

        if (/^@[A-Za-z0-9_.-]{3,50}$/.test(part)) {
          const username = part.slice(1)
          return (
            <button
              type="button"
              className="community-chat-mention"
              key={part + index}
              onClick={() => navigate('/membro/' + encodeURIComponent(username))}
            >
              {part}
            </button>
          )
        }

        return <React.Fragment key={index}>{part}</React.Fragment>
      })}
    </>
  )
}

function PresenceAvatars({ members }) {
  const visible = members.slice(0, 5)
  const rest = Math.max(0, members.length - visible.length)

  return (
    <div
      className="community-chat-presence"
      title={members.map((item) => item.display_name || item.username || 'Membro').join(', ')}
    >
      <div className="community-chat-presence-stack">
        {visible.map((member) => (
          member.avatar_url ? (
            <img key={member.user_id} src={member.avatar_url} alt="" />
          ) : (
            <span key={member.user_id}>
              {(member.display_name || member.username || 'M').slice(0, 1).toUpperCase()}
            </span>
          )
        ))}
        {rest > 0 && <b>+{rest}</b>}
      </div>
      <span>{members.length} online</span>
    </div>
  )
}

export function CommunityChat({
  session,
  profile,
  ignoredIds = [],
  navigate,
  notify,
}) {
  const userId = session?.user?.id
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [busy, setBusy] = useState(false)
  const [menuId, setMenuId] = useState(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [onlineMembers, setOnlineMembers] = useState([])
  const [connection, setConnection] = useState('connecting')
  const [restriction, setRestriction] = useState({ mute: null, ban: null })
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('creativezone-chat-collapsed') === 'true' } catch { return false }
  })
  const [expanded, setExpanded] = useState(false)
  const messagesRef = useRef(null)
  const shouldStickToBottom = useRef(true)

  const visibleMessages = useMemo(
    () => messages.filter((item) => !ignoredIds.includes(item.user_id)),
    [messages, ignoredIds]
  )

  const messageMap = useMemo(
    () => new Map(messages.map((item) => [item.id, item])),
    [messages]
  )

  const isStaff = ['moderator', 'admin'].includes(profile?.role)
  const visibleOnlineMembers = useMemo(
    () => onlineMembers.filter((item) => !ignoredIds.includes(item.user_id)),
    [onlineMembers, ignoredIds]
  )

  async function loadMessages() {
    try {
      setMessages(await getChatMessages(120))
    } catch (error) {
      notify?.(error?.message || 'Não foi possível carregar o Chat da Comunidade.')
    }
  }

  async function loadRestriction() {
    if (!userId) {
      setRestriction({ mute: null, ban: null })
      return
    }

    try {
      setRestriction(await getChatRestriction(userId))
    } catch {
      setRestriction({ mute: null, ban: null })
    }
  }

  function upsertMessage(item) {
    if (!item) return
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === item.id)
      const next = index >= 0
        ? current.map((message) => message.id === item.id ? item : message)
        : [...current, item]

      return next
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .slice(-200)
    })
  }

  useEffect(() => {
    loadMessages()
  }, [])

  useEffect(() => {
    loadRestriction()
  }, [userId])

  useEffect(() => {
    if (!supabase) {
      setConnection('offline')
      return undefined
    }

    const options = userId
      ? { config: { presence: { key: userId } } }
      : undefined

    const channel = supabase.channel('creativezone-community-chat-v1', options)

    const syncPresence = () => {
      const state = channel.presenceState()
      const byUser = new Map()

      Object.values(state || {}).flat().forEach((presence) => {
        if (!presence?.user_id) return
        if (!byUser.has(presence.user_id)) byUser.set(presence.user_id, presence)
      })

      setOnlineMembers([...byUser.values()])
    }

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            setMessages((current) => current.filter((item) => item.id !== payload.old?.id))
            return
          }

          const id = payload.new?.id
          if (!id) return

          try {
            const item = await getChatMessage(id)
            if (item) upsertMessage(item)
          } catch {
            loadMessages()
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('online')
          await loadMessages()

          if (userId && profile) {
            await channel.track({
              user_id: userId,
              username: profile.username,
              display_name: profile.display_name || profile.username,
              avatar_url: profile.avatar_url || '',
              role: profile.role || 'member',
              online_at: new Date().toISOString(),
            })
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('reconnecting')
        } else if (status === 'CLOSED') {
          setConnection('offline')
        }
      })

    return () => {
      if (userId) channel.untrack().catch(() => {})
      supabase.removeChannel(channel)
    }
  }, [
    userId,
    profile?.username,
    profile?.display_name,
    profile?.avatar_url,
    profile?.role,
  ])

  useEffect(() => {
    if (connection === 'online') return undefined

    const timer = window.setInterval(() => {
      loadMessages()
    }, 15000)

    return () => window.clearInterval(timer)
  }, [connection])

  useEffect(() => {
    const handleOnline = () => {
      setConnection((current) => current === 'online' ? current : 'connecting')
      loadMessages()
    }
    const handleOffline = () => setConnection('offline')

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (collapsed || !shouldStickToBottom.current) return
    const area = messagesRef.current
    if (area) area.scrollTop = area.scrollHeight
  }, [visibleMessages.length, collapsed])

  function rememberCollapsed(value) {
    setCollapsed(value)
    try { localStorage.setItem('creativezone-chat-collapsed', String(value)) } catch {}
  }

  async function submit(event) {
    event?.preventDefault()
    const content = text.trim()
    if (!content || busy) return

    if (!userId) {
      notify?.('Entre na sua conta para participar do Chat da Comunidade.')
      navigate('/entrar')
      return
    }

    setBusy(true)
    try {
      const messageId = await sendChatMessage(content, replyTo?.id || null)
      try {
        const item = await getChatMessage(messageId)
        if (item) upsertMessage(item)
      } catch {}
      setText('')
      setReplyTo(null)
      setEmojiOpen(false)
      shouldStickToBottom.current = true
      await loadRestriction()
    } catch (error) {
      notify?.(error?.message || 'Não foi possível enviar sua mensagem.')
      await loadRestriction()
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(messageId) {
    if (!editingText.trim()) return
    setBusy(true)
    try {
      await editChatMessage(messageId, editingText.trim())
      try {
        const item = await getChatMessage(messageId)
        if (item) upsertMessage(item)
      } catch {}
      setEditingId(null)
      setEditingText('')
      notify?.('Mensagem atualizada.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível editar a mensagem.')
    } finally {
      setBusy(false)
    }
  }

  async function removeMessage(message) {
    if (!window.confirm('Remover esta mensagem do Chat da Comunidade?')) return

    setBusy(true)
    try {
      if (message.user_id !== userId && isStaff) {
        await moderateChatMessage(message.id, 'delete', 'Mensagem removida diretamente no Chat da Comunidade.')
      } else {
        await deleteChatMessage(message.id)
      }
      try {
        const item = await getChatMessage(message.id)
        if (item) upsertMessage(item)
      } catch {}
      setMenuId(null)
      notify?.('Mensagem removida.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível remover a mensagem.')
    } finally {
      setBusy(false)
    }
  }

  async function staffAction(message, action, label) {
    const reason = window.prompt('Motivo da ação de moderação:', '')
    if (reason === null) return
    if (action === 'ban' && !window.confirm('Bloquear este membro permanentemente no Chat da Comunidade?')) {
      return
    }

    setBusy(true)
    try {
      await moderateChatMessage(message.id, action, reason)
      if (action === 'delete') {
        try {
          const item = await getChatMessage(message.id)
          if (item) upsertMessage(item)
        } catch {}
      }
      setMenuId(null)
      notify?.(label)
    } catch (error) {
      notify?.(error?.message || 'Não foi possível aplicar a ação de moderação.')
    } finally {
      setBusy(false)
    }
  }

  function transformToTopic(message) {
    if (message.deleted_at || !message.content) return
    const author = message.author?.username || message.author?.display_name || 'membro'
    const short = message.content.replace(/\s+/g, ' ').trim().slice(0, 80)

    try {
      localStorage.setItem('creativezone-draft', JSON.stringify({
        title: short ? 'Discussão: ' + short : 'Discussão iniciada no Chat da Comunidade',
        description:
          'Conversa iniciada no Chat da Comunidade:\n\n' +
          '[quote=@' + author + ']' + message.content + '[/quote]\n\n',
        categoryId: '',
      }))
    } catch {}

    notify?.('Rascunho criado a partir da conversa.')
    navigate('/novo-topico')
  }

  function onMessagesScroll(event) {
    const element = event.currentTarget
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    shouldStickToBottom.current = distance < 80
  }

  function onComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit(event)
    }
  }

  const currentMute = restriction.mute &&
    new Date(restriction.mute.muted_until).getTime() > Date.now()
      ? restriction.mute
      : null
  const currentBan = restriction.ban &&
    (!restriction.ban.banned_until || new Date(restriction.ban.banned_until).getTime() > Date.now())
      ? restriction.ban
      : null

  return (
    <section
      className={
        'community-chat ' +
        (collapsed ? 'is-collapsed ' : '') +
        (expanded ? 'is-expanded' : '')
      }
      aria-label="Chat da Comunidade"
    >
      <header className="community-chat-head">
        <div className="community-chat-title">
          <MessageCircle />
          <div>
            <strong>Chat da Comunidade</strong>
            <span>
              <i className={'chat-connection-dot status-' + connection} />
              {connection === 'online'
                ? 'Ao vivo'
                : connection === 'reconnecting'
                  ? 'Reconectando...'
                  : connection === 'offline'
                    ? 'Offline'
                    : 'Conectando...'}
            </span>
          </div>
        </div>

        <div className="community-chat-head-actions">
          <PresenceAvatars members={visibleOnlineMembers} />
          {!collapsed && (
            <button
              type="button"
              aria-label={expanded ? 'Restaurar tamanho do chat' : 'Expandir chat'}
              title={expanded ? 'Restaurar tamanho' : 'Expandir'}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </button>
          )}
          <button
            type="button"
            aria-label={collapsed ? 'Abrir Chat da Comunidade' : 'Minimizar Chat da Comunidade'}
            title={collapsed ? 'Abrir chat' : 'Minimizar chat'}
            onClick={() => rememberCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronDown /> : <ChevronUp />}
          </button>
        </div>
      </header>

      {!collapsed && (
        <>
          <div
            className="community-chat-messages"
            ref={messagesRef}
            onScroll={onMessagesScroll}
          >
            {visibleMessages.map((message) => {
              const author =
                message.author?.display_name ||
                message.author?.username ||
                visibleOnlineMembers.find((item) => item.user_id === message.user_id)?.display_name ||
                'Membro'
              const avatar =
                message.author?.avatar_url ||
                visibleOnlineMembers.find((item) => item.user_id === message.user_id)?.avatar_url ||
                ''
              const role =
                message.author?.role ||
                visibleOnlineMembers.find((item) => item.user_id === message.user_id)?.role ||
                'member'
              const reply = message.reply_to ? messageMap.get(message.reply_to) : null
              const own = message.user_id === userId
              const canEdit =
                own &&
                !message.deleted_at &&
                Date.now() - new Date(message.created_at).getTime() <= 10 * 60 * 1000
              const roleTag = roleLabel(role)

              return (
                <article
                  className={
                    'community-chat-message ' +
                    (message.deleted_at ? 'is-deleted ' : '') +
                    (own ? 'is-own' : '')
                  }
                  key={message.id}
                  id={'chat-message-' + message.id}
                >
                  <button
                    type="button"
                    className="community-chat-avatar"
                    onClick={() => message.author?.username && navigate('/membro/' + encodeURIComponent(message.author.username))}
                    disabled={!message.author?.username}
                  >
                    {avatar ? (
                      <img src={avatar} alt="" />
                    ) : (
                      <span>{author.slice(0, 1).toUpperCase()}</span>
                    )}
                  </button>

                  <div className="community-chat-message-main">
                    <div className="community-chat-message-meta">
                      <button
                        type="button"
                        onClick={() => message.author?.username && navigate('/membro/' + encodeURIComponent(message.author.username))}
                        disabled={!message.author?.username}
                      >
                        {author}
                      </button>
                      {roleTag && (
                        <b className={'community-chat-role role-' + role}>{roleTag}</b>
                      )}
                      <time>{formatTime(message.created_at)}</time>
                      {message.edited_at && <small>editada</small>}
                    </div>

                    {reply && (
                      <button
                        type="button"
                        className="community-chat-reply-preview"
                        onClick={() => document.getElementById('chat-message-' + reply.id)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        })}
                      >
                        <Reply />
                        <span>
                          <strong>{reply.author?.display_name || reply.author?.username || 'Membro'}</strong>
                          {reply.deleted_at ? 'Mensagem removida' : reply.content.slice(0, 120)}
                        </span>
                      </button>
                    )}

                    {editingId === message.id ? (
                      <div className="community-chat-edit">
                        <textarea
                          autoFocus
                          maxLength={500}
                          value={editingText}
                          onChange={(event) => setEditingText(event.target.value)}
                        />
                        <div>
                          <button className="action primary-action" onClick={() => saveEdit(message.id)} disabled={busy}>
                            Salvar
                          </button>
                          <button
                            className="action"
                            onClick={() => {
                              setEditingId(null)
                              setEditingText('')
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="community-chat-message-text">
                        {message.deleted_at ? (
                          <em>Mensagem removida.</em>
                        ) : (
                          <ChatText text={message.content} navigate={navigate} />
                        )}
                      </p>
                    )}
                  </div>

                  {!message.deleted_at && (
                    <div className="community-chat-message-menu">
                      <button
                        type="button"
                        aria-label="Opções da mensagem"
                        onClick={() => setMenuId((current) => current === message.id ? null : message.id)}
                      >
                        <MoreVertical />
                      </button>

                      {menuId === message.id && (
                        <div className="community-chat-menu-popover">
                          <button onClick={() => { setReplyTo(message); setMenuId(null) }}>
                            <Reply /> Responder
                          </button>

                          {canEdit && (
                            <button
                              onClick={() => {
                                setEditingId(message.id)
                                setEditingText(message.content)
                                setMenuId(null)
                              }}
                            >
                              <Edit3 /> Editar
                            </button>
                          )}

                          <button onClick={() => transformToTopic(message)}>
                            <MessageSquarePlus /> Transformar em tópico
                          </button>

                          {(own || isStaff) && (
                            <button className="danger" onClick={() => removeMessage(message)}>
                              <Trash2 /> Remover
                            </button>
                          )}

                          {session && !own && (
                            <ReportButton
                              session={session}
                              targetType="chat_message"
                              targetId={message.id}
                              notify={notify}
                              className="community-chat-report"
                            />
                          )}

                          {isStaff && !own && (
                            <>
                              <button onClick={() => staffAction(message, 'mute_10m', 'Membro silenciado por 10 minutos.')}>
                                <VolumeX /> Silenciar 10 min
                              </button>
                              <button onClick={() => staffAction(message, 'mute_1h', 'Membro silenciado por 1 hora.')}>
                                <VolumeX /> Silenciar 1 hora
                              </button>
                              <button className="danger" onClick={() => staffAction(message, 'ban', 'Membro bloqueado no chat.')}>
                                <Ban /> Banir do chat
                              </button>
                              <button onClick={() => staffAction(message, 'unmute', 'Silenciamento removido.')}>
                                <VolumeX /> Remover silêncio
                              </button>
                              <button onClick={() => staffAction(message, 'unban', 'Banimento removido.')}>
                                <Ban /> Remover banimento
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              )
            })}

            {!visibleMessages.length && (
              <div className="community-chat-empty">
                <MessageCircle />
                <strong>O chat está tranquilo por enquanto.</strong>
                <span>Comece uma conversa com a comunidade.</span>
              </div>
            )}
          </div>

          <div className="community-chat-composer">
            {replyTo && (
              <div className="community-chat-replying">
                <Reply />
                <span>
                  Respondendo a <strong>{replyTo.author?.display_name || replyTo.author?.username || 'Membro'}</strong>
                  <small>{replyTo.content.slice(0, 110)}</small>
                </span>
                <button type="button" aria-label="Cancelar resposta" onClick={() => setReplyTo(null)}>
                  <X />
                </button>
              </div>
            )}

            {currentBan ? (
              <div className="community-chat-restriction">
                <Ban />
                <span>Seu acesso ao Chat da Comunidade está bloqueado pela moderação.</span>
              </div>
            ) : currentMute ? (
              <div className="community-chat-restriction">
                <VolumeX />
                <span>
                  Você está silenciado até {new Date(currentMute.muted_until).toLocaleString('pt-BR')}.
                </span>
              </div>
            ) : session ? (
              <form onSubmit={submit}>
                <textarea
                  aria-label="Mensagem para o Chat da Comunidade"
                  maxLength={500}
                  rows={1}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder="O que está em sua mente?"
                />

                <div className="community-chat-composer-actions">
                  <div className="community-chat-emoji-wrap">
                    <button
                      type="button"
                      aria-label="Emojis"
                      title="Emojis"
                      onClick={() => setEmojiOpen((value) => !value)}
                    >
                      <Smile />
                    </button>
                    {emojiOpen && (
                      <div className="community-chat-emoji-picker">
                        {EMOJIS.map((emoji) => (
                          <button
                            type="button"
                            key={emoji}
                            onClick={() => {
                              setText((current) => current + emoji)
                              setEmojiOpen(false)
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className={text.length > 450 ? 'near-limit' : ''}>
                    {text.length}/500
                  </span>

                  <button
                    type="submit"
                    className="community-chat-send"
                    disabled={busy || !text.trim()}
                    aria-label="Enviar mensagem"
                  >
                    <Send />
                  </button>
                </div>
              </form>
            ) : (
              <button className="community-chat-login" onClick={() => navigate('/entrar')}>
                Entre na CreativeZone para participar do chat.
              </button>
            )}
          </div>

          <footer className="community-chat-foot">
            <span>
              Conversa rápida · histórico de 30 dias · mensagens importantes devem virar tópicos.
            </span>
            <span>Anti-flood ativo</span>
          </footer>
        </>
      )}
    </section>
  )
}
