import React, { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  Folder,
  FolderTree,
  MessageSquare,
} from 'lucide-react'
import { getForumNodeSummaries } from './services/forumApi'
import './forum-hierarchy.css'

function formatActivity(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

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

function LastActivity({ summary, onOpenTopic }) {
  if (!summary?.last_topic_id) {
    return <span className="forum-index-no-activity">Nenhuma publicação ainda</span>
  }

  const actor =
    summary.last_actor_display_name ||
    summary.last_actor_username ||
    'Membro'

  return (
    <button
      className="forum-index-last"
      onClick={() => onOpenTopic(summary.last_topic_id)}
    >
      <span className="forum-last-avatar">
        {summary.last_actor_avatar_url ? (
          <img src={summary.last_actor_avatar_url} alt="" />
        ) : (
          <b>{actor.slice(0, 1).toUpperCase()}</b>
        )}
      </span>
      <span>
        <strong>{summary.last_topic_title}</strong>
        <small>
          {actor}
          {summary.last_activity_at ? ' · ' + formatActivity(summary.last_activity_at) : ''}
        </small>
      </span>
      <ChevronRight />
    </button>
  )
}

export function ForumIndex({ categories, navigate, notify, onOpenTopic }) {
  const [summaries, setSummaries] = useState({})

  const roots = useMemo(
    () => (categories || [])
      .filter((item) => !item.parent_id && item.node_type === 'category')
      .sort((a, b) =>
        Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
      ),
    [categories]
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

  const visibleNodeIds = useMemo(
    () => roots.flatMap((root) => (childrenByParent.get(root.id) || []).map((child) => child.id)),
    [roots, childrenByParent]
  )

  useEffect(() => {
    let cancelled = false
    if (!visibleNodeIds.length) {
      setSummaries({})
      return undefined
    }

    getForumNodeSummaries(visibleNodeIds)
      .then((result) => {
        if (!cancelled) setSummaries(result)
      })
      .catch((error) => {
        if (!cancelled) {
          setSummaries({})
          notify?.(error?.message || 'Não foi possível carregar a atividade das categorias.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [visibleNodeIds, notify])

  if (!roots.length) {
    return (
      <section className="forum-index-empty">
        <p>Nenhuma categoria principal foi criada ainda.</p>
      </section>
    )
  }

  return (
    <div className="forum-index">
      {roots.map((root) => {
        const children = childrenByParent.get(root.id) || []
        return (
          <section className="forum-index-category" key={root.id}>
            <header className="forum-index-category-head">
              <button onClick={() => navigate('/forum/' + encodeURIComponent(root.slug))}>
                <span>
                  <small>CATEGORIA</small>
                  <strong>{root.name}</strong>
                </span>
                <ChevronRight />
              </button>
            </header>

            <div className="forum-index-nodes">
              {children.map((child) => {
                const descendants = childrenByParent.get(child.id) || []
                const summary = summaries[child.id] || {}

                return (
                  <article className="forum-index-row" key={child.id}>
                    <div className="forum-index-node">
                      <button
                        className="forum-index-node-open"
                        onClick={() => navigate('/forum/' + encodeURIComponent(child.slug))}
                      >
                        <span className={'forum-index-icon type-' + child.node_type}>
                          <NodeIcon type={child.node_type} />
                        </span>
                        <span className="forum-index-copy">
                          <small>{nodeLabel(child.node_type)}</small>
                          <strong>{child.name}</strong>
                          <p>{child.description || 'Área da comunidade CreativeZone.'}</p>
                        </span>
                      </button>

                      {descendants.length > 0 && (
                        <div className="forum-index-sublinks">
                          {descendants.map((descendant) => (
                            <button
                              key={descendant.id}
                              onClick={() => navigate('/forum/' + encodeURIComponent(descendant.slug))}
                            >
                              <MessageSquare />
                              {descendant.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="forum-index-counts">
                      <span><b>{summary.topic_count || 0}</b> tópicos</span>
                      <span><b>{summary.post_count || 0}</b> respostas</span>
                    </div>

                    <LastActivity summary={summary} onOpenTopic={onOpenTopic} />
                  </article>
                )
              })}

              {!children.length && (
                <p className="community-empty">Nenhuma subcategoria foi criada nesta categoria.</p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
