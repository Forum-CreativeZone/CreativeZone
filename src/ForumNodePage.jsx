import React, { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderTree,
  MessageSquare,
  Plus,
  Pin,
  LockKeyhole,
  BarChart3,
} from 'lucide-react'
import { getForumNodeSummaries, getTopicsPage } from './services/forumApi'
import { createCategory } from './services/categoryApi'
import { buildTopicPath } from './seo'

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

function ChildCreateForm({
  target,
  draft,
  setDraft,
  busy,
  onSubmit,
  onCancel,
  compact = false,
}) {
  if (!target) return null
  const isSection = target.nodeType === 'section'
  const title = isSection ? 'Nova subcategoria' : 'Novo fórum'

  return (
    <form
      className={'forum-node-create-panel' + (compact ? ' compact' : '')}
      onSubmit={onSubmit}
    >
      <div className="forum-node-create-heading">
        <div>
          <small>{isSection ? 'SUBCATEGORIA' : 'FÓRUM'}</small>
          <strong>{title}</strong>
          <span>
            Dentro de <b>{target.parent.name}</b>
          </span>
        </div>
        <button type="button" className="forum-node-create-close" onClick={onCancel}>
          Fechar
        </button>
      </div>

      <div className="forum-node-create-fields">
        <label>
          Nome
          <input
            required
            minLength={3}
            maxLength={80}
            value={draft.name}
            onChange={(event) => setDraft((current) => ({
              ...current,
              name: event.target.value,
            }))}
            placeholder={isSection ? 'Ex.: Recursos gráficos' : 'Ex.: Packs e templates'}
          />
        </label>

        <label className="forum-node-create-order">
          Ordem
          <input
            type="number"
            value={draft.sortOrder}
            onChange={(event) => setDraft((current) => ({
              ...current,
              sortOrder: event.target.value,
            }))}
          />
        </label>
      </div>

      <label>
        Descrição
        <textarea
          maxLength={1200}
          value={draft.description}
          onChange={(event) => setDraft((current) => ({
            ...current,
            description: event.target.value,
          }))}
          placeholder="Explique o que pertence a esta área."
        />
      </label>

      <div className="forum-node-create-actions">
        <button type="button" className="action" onClick={onCancel}>
          Cancelar
        </button>
        <button className="action primary-action" disabled={busy}>
          <Plus /> {busy ? 'Criando...' : title}
        </button>
      </div>
    </form>
  )
}

export function ForumNodePage({
  node,
  categories,
  session,
  profile,
  navigate,
  notify,
  onOpenTopic,
  onChanged,
  ignoredIds = [],
}) {
  const [topics, setTopics] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [summaries, setSummaries] = useState({})
  const [createTarget, setCreateTarget] = useState(null)
  const [createDraft, setCreateDraft] = useState({
    name: '',
    description: '',
    sortOrder: 0,
  })
  const [createBusy, setCreateBusy] = useState(false)
  const isAdmin = profile?.role === 'admin'

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
  }, [node?.id, node?.node_type, page, ignoredIds, notify])

  useEffect(() => {
    setPage(1)
    setCreateTarget(null)
  }, [node?.id])

  function nextSortOrder(parentId) {
    const siblings = (categories || []).filter((item) => item.parent_id === parentId)
    const highest = siblings.reduce(
      (max, item) => Math.max(max, Number(item.sort_order || 0)),
      0
    )
    return highest + 10
  }

  function startCreate(parent, nodeType) {
    setCreateTarget({ parent, nodeType })
    setCreateDraft({
      name: '',
      description: '',
      sortOrder: nextSortOrder(parent.id),
    })
  }

  async function submitChild(event) {
    event.preventDefault()
    if (!createTarget) return

    setCreateBusy(true)
    try {
      await createCategory({
        name: createDraft.name,
        description: createDraft.description,
        parentId: createTarget.parent.id,
        nodeType: createTarget.nodeType,
        sortOrder: createDraft.sortOrder,
      })
      await onChanged?.()
      notify?.(
        createTarget.nodeType === 'section'
          ? 'Subcategoria criada nesta categoria.'
          : 'Fórum criado nesta subcategoria.'
      )
      setCreateTarget(null)
      setCreateDraft({ name: '', description: '', sortOrder: 0 })
    } catch (error) {
      notify?.(error?.message || 'Não foi possível criar esta área.')
    } finally {
      setCreateBusy(false)
    }
  }

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
              onClick={() => session
                ? navigate('/novo-topico?category=' + encodeURIComponent(node.id))
                : navigate('/entrar')}
            >
              <Plus /> Novo tópico
            </button>
          )}
        </header>

        {node.node_type !== 'forum' && (
          <section className="forum-child-nodes">
            <div className="forum-node-section-title">
              <strong>{childTitle}</strong>
              <div className="forum-node-section-actions">
                <span>{children.length}</span>
                {isAdmin && (
                  <button
                    type="button"
                    className="action forum-node-add-child"
                    onClick={() => startCreate(
                      node,
                      node.node_type === 'category' ? 'section' : 'forum'
                    )}
                  >
                    <Plus />
                    {node.node_type === 'category' ? 'Nova subcategoria' : 'Novo fórum'}
                  </button>
                )}
              </div>
            </div>

            {createTarget?.parent?.id === node.id && (
              <ChildCreateForm
                target={createTarget}
                draft={createDraft}
                setDraft={setCreateDraft}
                busy={createBusy}
                onSubmit={submitChild}
                onCancel={() => setCreateTarget(null)}
              />
            )}

            {children.length ? (
              <div className="forum-child-list forum-child-list-detailed">
                {children.map((child) => {
                  const summary = summaries[child.id] || {}
                  const descendants = childrenByParent.get(child.id) || []
                  return (
                    <article className="forum-child-row" key={child.id}>
                      <div className="forum-child-primary">
                        <a
                          className="forum-child-open"
                          href={'/forum/' + encodeURIComponent(child.slug)}
                          onClick={(event) => {
                            event.preventDefault()
                            navigate('/forum/' + encodeURIComponent(child.slug))
                          }}
                        >
                          <span className={'forum-child-icon type-' + child.node_type}>
                            <NodeIcon type={child.node_type} />
                          </span>
                          <span className="forum-child-copy">
                            <small>{nodeLabel(child.node_type)}</small>
                            <strong>{child.name}</strong>
                            <p>{child.description || 'Área da comunidade CreativeZone.'}</p>
                          </span>
                          <ChevronRight />
                        </a>

                        {descendants.length > 0 && (
                          <div className="forum-child-sublinks">
                            {descendants.map((descendant) => (
                              <a
                                key={descendant.id}
                                href={'/forum/' + encodeURIComponent(descendant.slug)}
                                onClick={(event) => {
                                  event.preventDefault()
                                  navigate('/forum/' + encodeURIComponent(descendant.slug))
                                }}
                              >
                                <MessageSquare />
                                {descendant.name}
                              </a>
                            ))}
                          </div>
                        )}

                        {isAdmin && child.node_type === 'section' && (
                          <button
                            type="button"
                            className="forum-child-add-forum"
                            onClick={() => startCreate(child, 'forum')}
                          >
                            <Plus /> Criar fórum aqui
                          </button>
                        )}
                      </div>

                      <div className="forum-child-counts">
                        <span><b>{summary.topic_count || 0}</b> tópicos</span>
                        <span><b>{summary.post_count || 0}</b> respostas</span>
                      </div>

                      {summary.last_topic_id ? (
                        <a
                          className="forum-child-last"
                          href={buildTopicPath({
                            id: summary.last_topic_id,
                            title: summary.last_topic_title,
                          })}
                          data-profile-username={summary.last_actor_username || undefined}
                          onClick={(event) => {
                            event.preventDefault()
                            onOpenTopic({
                              id: summary.last_topic_id,
                              title: summary.last_topic_title,
                            })
                          }}
                        >
                          <span className="forum-last-avatar"><ActorAvatar summary={summary} /></span>
                          <span>
                            <strong>{summary.last_topic_title}</strong>
                            <small>
                              {summary.last_actor_display_name || summary.last_actor_username || 'Membro'}
                              {summary.last_activity_at ? ' · ' + formatActivity(summary.last_activity_at) : ''}
                            </small>
                          </span>
                          <ChevronRight />
                        </a>
                      ) : (
                        <span className="forum-child-last forum-child-last-empty">
                          <span className="forum-no-activity">Nenhuma publicação ainda</span>
                        </span>
                      )}

                      {createTarget?.parent?.id === child.id && (
                        <ChildCreateForm
                          target={createTarget}
                          draft={createDraft}
                          setDraft={setCreateDraft}
                          busy={createBusy}
                          onSubmit={submitChild}
                          onCancel={() => setCreateTarget(null)}
                          compact
                        />
                      )}
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
                  const hasReplies = Number(topic.reply_count || 0) > 0
                  const hasPoll = Boolean(topic.has_poll)
                  return (
                    <a
                      key={topic.id}
                      className={[
                        'forum-topic-row',
                        topic.pinned ? 'is-pinned' : '',
                        topic.locked ? 'is-locked' : '',
                        hasPoll ? 'has-poll' : '',
                      ].filter(Boolean).join(' ')}
                      href={buildTopicPath(topic)}
                      onClick={(event) => {
                        event.preventDefault()
                        onOpenTopic(topic)
                      }}
                    >
                      <span
                        className="forum-topic-avatar"
                        data-profile-username={topic.author_username || undefined}
                      >
                        {topic.author_avatar_url ? (
                          <img src={topic.author_avatar_url} alt="" />
                        ) : (
                          <b>{(topic.author_display_name || topic.author_username || 'M').slice(0, 1)}</b>
                        )}
                      </span>
                      <span
                        className="forum-topic-copy"
                        data-profile-username={topic.author_username || undefined}
                      >
                        <span className="forum-topic-title-line">
                          <span className="forum-topic-status-icons" aria-label="Status do tópico">
                            {topic.pinned && <Pin title="Tópico fixado" />}
                            {topic.locked && <LockKeyhole title="Tópico fechado" />}
                            {hasPoll && <BarChart3 title="Este tópico contém uma enquete" />}
                          </span>
                          <strong>{topic.title}</strong>
                        </span>
                        <small>
                          {topic.author_display_name || topic.author_username || 'Membro'}
                          {' · '}
                          {formatActivity(topic.created_at)}
                        </small>
                      </span>

                      <span className="forum-topic-stats" aria-label="Estatísticas do tópico">
                        <span>
                          <b>{topic.reply_count || 0}</b>
                          <small>Respostas</small>
                        </span>
                        <span>
                          <b>{topic.views || 0}</b>
                          <small>Visitas</small>
                        </span>
                      </span>
                      {hasReplies ? (
                        <span
                          className="forum-topic-latest"
                          data-profile-username={topic.last_actor_username || topic.author_username || undefined}
                        >
                          <span className="forum-last-avatar">
                            {latestAvatar ? <img src={latestAvatar} alt="" /> : <b>{latestName.slice(0, 1)}</b>}
                          </span>
                          <span>
                            <strong>{latestName}</strong>
                            <small>{formatActivity(topic.last_activity_at || topic.updated_at || topic.created_at)}</small>
                          </span>
                        </span>
                      ) : (
                        <span className="forum-topic-latest forum-topic-latest-origin">
                          <span>
                            <strong>Publicado</strong>
                            <small>{formatActivity(topic.created_at || topic.updated_at)}</small>
                          </span>
                        </span>
                      )}
                    </a>
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
