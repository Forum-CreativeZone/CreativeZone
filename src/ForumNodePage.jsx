import React, { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderTree,
  MessageSquare,
  Plus,
} from 'lucide-react'
import { getForumNodeSummaries, getTopicsPage } from './services/forumApi'

function NodeIcon({ type }) {
  if (type === 'category') return <FolderTree />
  if (type === 'section') return <Folder />
  return <MessageSquare />
}

function nodeLabel(type) {
  if (type === 'category') return 'Categoria'
  if (type === 'section') return 'Subcategoria'
  return 'Fórum'
}

function formatActivity(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function ActorAvatar({ summary }) {
  const name = summary?.last_actor_display_name || summary?.last_actor_username || 'Membro'
  return summary?.last_actor_avatar_url ? (
    <img src={summary.last_actor_avatar_url} alt="" />
  ) : (
    <b>{name.slice(0, 1).toUpperCase()}</b>
  )
}

export function ForumNodePage({
  node,
  categories,
  session,
  navigate,
  notify,
  onOpenTopic,
  ignoredIds = [],
}) {
  const [topics, setTopics] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [summaries, setSummaries] = useState({})

  const children = useMemo(
    () => (categories || [])
      .filter((item) => item.parent_id === node?.id)
      .sort((a, b) =>
        Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
      ),
    [categories, node?.id]
  )

  const childrenByParent = useMemo(() => {
    const map = new Map()
    for (const item of categories || []) {
      const list = map.get(item.parent_id) || []
      list.push(item)
      map.set(item.parent_id, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
      )
    }
    return map
  }, [categories])

  useEffect(() => {
    let cancelled = false
    const ids = children.map((item) => item.id)
    if (!ids.length) {
      setSummaries({})
      return undefined
    }

    getForumNodeSummaries(ids)
      .then((result) => {
        if (!cancelled) setSummaries(result)
      })
      .catch(() => {
        if (!cancelled) setSummaries({})
      })

    return () => {
      cancelled = true
    }
  }, [children])

  useEffect(() => {
    let cancelled = false
    if (!node?.id || node.node_type !== 'forum') {
      setTopics([])
      setTotal(0)
      setLoading(false)
      return undefined
    }

    setLoading(true)
    getTopicsPage({
      page,
      pageSize: 15,
      categoryId: node.id,
      sort: 'recent',
      ignoredIds,
    })
      .then((result) => {
        if (cancelled) return
        setTopics(result.items || [])
        setTotal(result.total || 0)
      })
      .catch((error) => {
        if (!cancelled) {
          setTopics([])
          setTotal(0)
          notify?.(error?.message || 'Não foi possível carregar os tópicos deste fórum.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [node?.id, node?.node_type, page, ignoredIds])

  useEffect(() => {
    setPage(1)
  }, [node?.id])

  if (!node) {
    return (
      <section className="community-page community-page-wide">
        <div className="community-page-card">
          <p className="community-empty">Área do fórum não encontrada.</p>
        </div>
      </section>
    )
  }

  const pageCount = Math.max(1, Math.ceil(total / 15))
  const childTitle = node.node_type === 'category' ? 'Subcategorias' : 'Fóruns'

  return (
    <section className="community-page community-page-wide forum-node-page">
      <div className="community-page-card">
        <header className="forum-node-head">
          <div>
            <button className="page-back" onClick={() => navigate('/')}>
              <ChevronLeft /> Voltar
            </button>
            <span className="forum-node-type">{nodeLabel(node.node_type)}</span>
            <h1>{node.name}</h1>
            {node.description && <p>{node.description}</p>}
          </div>

          {node.node_type === 'forum' && (
            <button
              className="action primary-action forum-node-new-topic"
              onClick={() => session ? navigate('/novo-topico') : navigate('/entrar')}
            >
              <Plus /> Novo tópico
            </button>
          )}
        </header>

        {node.node_type !== 'forum' && (
          <section className="forum-child-nodes">
            <div className="forum-node-section-title">
              <strong>{childTitle}</strong>
              <span>{children.length}</span>
            </div>

            {children.length ? (
              <div className="forum-child-list forum-child-list-detailed">
                {children.map((child) => {
                  const summary = summaries[child.id] || {}
                  const descendants = childrenByParent.get(child.id) || []
                  return (
                    <article className="forum-child-row" key={child.id}>
                      <button
                        className="forum-child-main"
                        onClick={() => navigate('/forum/' + encodeURIComponent(child.slug))}
                      >
                        <span className={'forum-child-icon type-' + child.node_type}>
                          <NodeIcon type={child.node_type} />
                        </span>
                        <span className="forum-child-copy">
                          <small>{nodeLabel(child.node_type)}</small>
                          <strong>{child.name}</strong>
                          <p>{child.description || 'Área da comunidade CreativeZone.'}</p>
                          {descendants.length > 0 && (
                            <span className="forum-child-sublinks">
                              {descendants.map((descendant) => (
                                <button
                                  type="button"
                                  key={descendant.id}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    navigate('/forum/' + encodeURIComponent(descendant.slug))
                                  }}
                                >
                                  {descendant.name}
                                </button>
                              ))}
                            </span>
                          )}
                        </span>
                        <span className="forum-child-counts">
                          <b>{summary.topic_count || 0}</b>
                          <small>tópicos</small>
                          <b>{summary.post_count || 0}</b>
                          <small>respostas</small>
                        </span>
                      </button>

                      <button
                        className="forum-child-last"
                        disabled={!summary.last_topic_id}
                        onClick={() => summary.last_topic_id && onOpenTopic(summary.last_topic_id)}
                      >
                        {summary.last_topic_id ? (
                          <>
                            <span className="forum-last-avatar"><ActorAvatar summary={summary} /></span>
                            <span>
                              <strong>{summary.last_topic_title}</strong>
                              <small>
                                {summary.last_actor_display_name || summary.last_actor_username || 'Membro'}
                                {summary.last_activity_at ? ' · ' + formatActivity(summary.last_activity_at) : ''}
                              </small>
                            </span>
                            <ChevronRight />
                          </>
                        ) : (
                          <span className="forum-no-activity">Nenhuma publicação ainda</span>
                        )}
                      </button>
                    </article>
                  )
                })}
              </div>
            ) : (
              <p className="community-empty">Nenhuma área foi criada aqui ainda.</p>
            )}
          </section>
        )}

        {node.node_type === 'forum' && (
          <section className="forum-node-topics">
            <div className="forum-node-section-title">
              <strong>Tópicos</strong>
              <span>{total}</span>
            </div>

            {loading ? (
              <p className="community-empty">Carregando tópicos...</p>
            ) : topics.length ? (
              <div className="forum-node-topic-list forum-topic-table">
                {topics.map((topic) => {
                  const latestName = topic.last_actor_display_name || topic.last_actor_username || topic.author_display_name || topic.author_username || 'Membro'
                  const latestAvatar = topic.last_actor_avatar_url || topic.author_avatar_url
                  return (
                    <button key={topic.id} onClick={() => onOpenTopic(topic.id)}>
                      <span className="forum-topic-avatar">
                        {topic.author_avatar_url ? (
                          <img src={topic.author_avatar_url} alt="" />
                        ) : (
                          <b>{(topic.author_display_name || topic.author_username || 'M').slice(0, 1)}</b>
                        )}
                      </span>
                      <span className="forum-topic-copy">
                        <strong>{topic.title}</strong>
                        <small>
                          {topic.author_display_name || topic.author_username || 'Membro'}
                          {' · '}
                          {topic.reply_count || 0} respostas
                          {' · '}
                          {topic.views || 0} visualizações
                        </small>
                      </span>
                      <span className="forum-topic-latest">
                        <span className="forum-last-avatar">
                          {latestAvatar ? <img src={latestAvatar} alt="" /> : <b>{latestName.slice(0, 1)}</b>}
                        </span>
                        <span>
                          <strong>{latestName}</strong>
                          <small>{formatActivity(topic.last_activity_at || topic.updated_at || topic.created_at)}</small>
                        </span>
                      </span>
                      {topic.pinned && <span className="forum-topic-pinned">FIXADO</span>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="community-empty">Ainda não há tópicos neste fórum.</p>
            )}

            {pageCount > 1 && (
              <nav className="forum-node-pagination" aria-label="Paginação">
                <button
                  className="action"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeft /> Anterior
                </button>
                <span>{page} de {pageCount}</span>
                <button
                  className="action"
                  disabled={page >= pageCount}
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                >
                  Próxima <ChevronRight />
                </button>
              </nav>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
