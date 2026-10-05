import React, { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderTree,
  MessageSquare,
  Plus,
} from 'lucide-react'
import { getTopicsPage } from './services/forumApi'

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

  const children = useMemo(
    () => (categories || [])
      .filter((item) => item.parent_id === node?.id)
      .sort((a, b) =>
        Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
      ),
    [categories, node?.id]
  )

  useEffect(() => {
    let cancelled = false
    if (!node?.id) return undefined

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
          notify?.(error?.message || 'Não foi possível carregar esta área.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [node?.id, page, ignoredIds])

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

        {children.length > 0 && (
          <section className="forum-child-nodes">
            <div className="forum-node-section-title">
              <strong>
                {node.node_type === 'category' ? 'Subcategorias e fóruns' : 'Fóruns'}
              </strong>
              <span>{children.length}</span>
            </div>
            <div className="forum-child-list">
              {children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => navigate('/forum/' + encodeURIComponent(child.slug))}
                >
                  <span className={'forum-child-icon type-' + child.node_type}>
                    <NodeIcon type={child.node_type} />
                  </span>
                  <span>
                    <small>{nodeLabel(child.node_type)}</small>
                    <strong>{child.name}</strong>
                    <p>{child.description || 'Área da comunidade CreativeZone.'}</p>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="forum-node-topics">
          <div className="forum-node-section-title">
            <strong>
              {node.node_type === 'forum' ? 'Tópicos' : 'Tópicos recentes nesta área'}
            </strong>
            <span>{total}</span>
          </div>

          {loading ? (
            <p className="community-empty">Carregando tópicos...</p>
          ) : topics.length ? (
            <div className="forum-node-topic-list">
              {topics.map((topic) => (
                <button key={topic.id} onClick={() => onOpenTopic(topic.id)}>
                  <span className="forum-topic-avatar">
                    {topic.author_avatar_url ? (
                      <img src={topic.author_avatar_url} alt="" />
                    ) : (
                      <b>{(topic.author_display_name || topic.author_username || 'M').slice(0,1)}</b>
                    )}
                  </span>
                  <span className="forum-topic-copy">
                    <strong>{topic.title}</strong>
                    <p>{topic.content}</p>
                    <small>
                      {topic.author_display_name || topic.author_username || 'Membro'}
                      {' · '}
                      {topic.reply_count || 0} respostas
                      {' · '}
                      {topic.views || 0} visualizações
                    </small>
                  </span>
                  {topic.pinned && <span className="forum-topic-pinned">FIXADO</span>}
                </button>
              ))}
            </div>
          ) : (
            <p className="community-empty">Ainda não há tópicos nesta área.</p>
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
      </div>
    </section>
  )
}
