import React, { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  Folder,
  FolderTree,
  Lightbulb,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import {
  createCategory,
  deleteCategory,
  getCategorySuggestions,
  reviewCategorySuggestion,
  submitCategorySuggestion,
  updateCategory,
} from './services/categoryApi'

const nodeLabels = {
  category: 'Categoria principal',
  section: 'Subcategoria',
  forum: 'Fórum',
}

function Shell({ children, navigate }) {
  return (
    <section className="community-page community-page-wide category-page">
      <div className="community-page-card">
        <header className="community-page-head">
          <button onClick={() => navigate('/')}>← Voltar</button>
          <h1>Categorias da CreativeZone</h1>
        </header>
        {children}
      </div>
    </section>
  )
}

function flattenCategories(categories) {
  const byParent = new Map()
  for (const category of categories || []) {
    const key = category.parent_id || 'root'
    const items = byParent.get(key) || []
    items.push(category)
    byParent.set(key, items)
  }

  for (const items of byParent.values()) {
    items.sort((a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    )
  }

  const result = []
  const walk = (parentId, depth) => {
    for (const item of byParent.get(parentId) || []) {
      result.push({ ...item, depth })
      walk(item.id, depth + 1)
    }
  }
  walk('root', 0)
  return result
}

function validParents(categories, nodeType, currentId = null) {
  if (nodeType === 'category') return []
  return (categories || []).filter((item) => {
    if (item.id === currentId) return false
    if (nodeType === 'section') return item.node_type === 'category'
    return ['category', 'section'].includes(item.node_type)
  })
}

function NodeIcon({ type }) {
  if (type === 'category') return <FolderTree />
  if (type === 'section') return <Folder />
  return <MessageSquare />
}

export function CategorySuggestionButton({
  session,
  navigate,
  notify,
  className = '',
  label = 'Sugerir categoria',
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  function start() {
    if (!session?.user) {
      notify?.('Entre na sua conta para sugerir uma categoria.')
      navigate?.('/entrar')
      return
    }
    setOpen(true)
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await submitCategorySuggestion(session.user.id, { name, description })
      setOpen(false)
      setName('')
      setDescription('')
      notify?.('Sugestão enviada. A equipe da CreativeZone poderá analisá-la.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível enviar a sugestão.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={'category-suggestion-trigger ' + className}
        onClick={start}
      >
        <Lightbulb />
        {label}
      </button>

      {open && (
        <div className="category-suggestion-backdrop" onMouseDown={() => setOpen(false)}>
          <form
            className="category-suggestion-dialog"
            onSubmit={submit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>SUGESTÃO PARA O FÓRUM</span>
                <strong>Qual área está faltando?</strong>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setOpen(false)}>
                <X />
              </button>
            </header>

            <p>
              Conte qual espaço você gostaria de ver na CreativeZone e para que ele seria usado.
              A sugestão será enviada para a administração.
            </p>

            <label>
              Nome sugerido
              <input
                required
                minLength={3}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Inteligência Artificial"
              />
            </label>

            <label>
              Por que essa área seria útil?
              <textarea
                maxLength={1200}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Explique o tipo de discussão que deveria ficar nessa área."
              />
            </label>

            <button className="action primary-action" disabled={busy}>
              <Send />
              {busy ? 'Enviando...' : 'Enviar sugestão'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}

export function CategoriesPage({
  categories,
  session,
  profile,
  navigate,
  notify,
  onChoose,
  onChanged,
}) {
  const isAdmin = profile?.role === 'admin'
  const [form, setForm] = useState({
    name: '',
    description: '',
    sortOrder: 0,
  })
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({
    name: '',
    description: '',
    nodeType: 'forum',
    parentId: '',
    sortOrder: 0,
  })
  const [suggestions, setSuggestions] = useState([])
  const [suggestionStatus, setSuggestionStatus] = useState('pending')
  const [suggestionParents, setSuggestionParents] = useState({})
  const [busy, setBusy] = useState(false)

  const flattened = useMemo(() => flattenCategories(categories), [categories])
  const editParents = validParents(categories, editDraft.nodeType, editingId)
  const forumParents = (categories || []).filter((item) =>
    ['category', 'section'].includes(item.node_type)
  )

  async function loadSuggestions() {
    if (!isAdmin) return
    try {
      const rows = await getCategorySuggestions(suggestionStatus)
      setSuggestions(rows)
      setSuggestionParents((current) => {
        const next = { ...current }
        const fallback =
          (categories || []).find((item) => item.node_type === 'section')?.id ||
          (categories || []).find((item) => item.node_type === 'category')?.id ||
          ''
        for (const row of rows) {
          if (!next[row.id]) next[row.id] = fallback
        }
        return next
      })
    } catch (error) {
      notify?.(error?.message || 'Não foi possível carregar as sugestões.')
    }
  }

  useEffect(() => {
    loadSuggestions()
  }, [isAdmin, suggestionStatus, categories])

  async function addCategory(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await createCategory({
        name: form.name,
        description: form.description,
        parentId: null,
        nodeType: 'category',
        sortOrder: form.sortOrder,
      })
      setForm((current) => ({
        ...current,
        name: '',
        description: '',
        sortOrder: 0,
      }))
      await onChanged?.()
      notify?.('Categoria principal criada. Abra a categoria para criar subcategorias e fóruns pela própria árvore.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível criar a categoria.')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(category) {
    setEditingId(category.id)
    setEditDraft({
      name: category.name || '',
      description: category.description || '',
      nodeType: category.node_type || 'forum',
      parentId: category.parent_id || '',
      sortOrder: Number(category.sort_order || 0),
    })
  }

  async function saveEdit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await updateCategory(editingId, {
        name: editDraft.name,
        description: editDraft.description,
        parentId: editDraft.nodeType === 'category' ? null : editDraft.parentId,
        nodeType: editDraft.nodeType,
        sortOrder: editDraft.sortOrder,
      })
      setEditingId(null)
      await onChanged?.()
      notify?.('Categoria atualizada.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível atualizar a categoria.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(category) {
    if (!window.confirm(
      `Excluir “${category.name}”?\n\nÁreas que possuem tópicos ou subcategorias não podem ser removidas até que o conteúdo seja movido ou excluído.`
    )) return

    setBusy(true)
    try {
      await deleteCategory(category.id)
      await onChanged?.()
      notify?.('Categoria excluída.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível excluir a categoria.')
    } finally {
      setBusy(false)
    }
  }

  async function reviewSuggestion(item, status) {
    setBusy(true)
    try {
      await reviewCategorySuggestion({
        suggestionId: item.id,
        reviewerId: session.user.id,
        status,
      })
      await loadSuggestions()
      notify?.(status === 'approved' ? 'Sugestão aprovada.' : 'Sugestão recusada.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível atualizar a sugestão.')
    } finally {
      setBusy(false)
    }
  }

  async function approveAndCreate(item) {
    const parentId = suggestionParents[item.id]
    if (!parentId) {
      notify?.('Escolha onde a nova área deve ficar.')
      return
    }

    setBusy(true)
    try {
      await createCategory({
        name: item.suggested_name,
        description: item.description,
        parentId,
        nodeType: 'forum',
      })
      await reviewCategorySuggestion({
        suggestionId: item.id,
        reviewerId: session.user.id,
        status: 'approved',
        adminNote: 'Fórum criado a partir desta sugestão.',
      })
      await Promise.all([onChanged?.(), loadSuggestions()])
      notify?.('Sugestão aprovada e fórum criado.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível aprovar a sugestão.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell navigate={navigate}>
      <div className="categories-page-content">
        <section className="categories-intro">
          <span>ESTRUTURA DO FÓRUM</span>
          <h2>Categoria → Subcategoria → Fórum → Tópicos.</h2>
          <p>
            A CreativeZone usa uma hierarquia para organizar o conteúdo. Categorias principais
            agrupam grandes áreas, subcategorias organizam seções e os fóruns são o nível em que
            os membros publicam tópicos.
          </p>
          {!isAdmin && (
            <CategorySuggestionButton
              session={session}
              navigate={navigate}
              notify={notify}
              className="action"
            />
          )}
        </section>

        <section className="category-directory">
          <div className="category-section-title">
            <div>
              <span>ESTRUTURA ATIVA</span>
              <h2>Categorias e fóruns</h2>
            </div>
            <b>{categories.length}</b>
          </div>

          <div className="category-directory-list category-tree-list">
            {flattened.map((category) => (
              <article
                className={'category-directory-card category-node-' + category.node_type}
                key={category.id}
                style={{ '--category-depth': category.depth }}
              >
                {editingId === category.id ? (
                  <form className="category-inline-edit" onSubmit={saveEdit}>
                    <div className="category-form-grid">
                      <label>
                        Tipo
                        <select
                          value={editDraft.nodeType}
                          onChange={(event) => setEditDraft((draft) => ({
                            ...draft,
                            nodeType: event.target.value,
                            parentId: event.target.value === 'category' ? '' : draft.parentId,
                          }))}
                        >
                          <option value="category">Categoria principal</option>
                          <option value="section">Subcategoria</option>
                          <option value="forum">Fórum</option>
                        </select>
                      </label>
                      {editDraft.nodeType !== 'category' && (
                        <label>
                          Pertence a
                          <select
                            required
                            value={editDraft.parentId}
                            onChange={(event) => setEditDraft((draft) => ({
                              ...draft,
                              parentId: event.target.value,
                            }))}
                          >
                            <option value="">Selecione...</option>
                            {editParents.map((parent) => (
                              <option key={parent.id} value={parent.id}>{parent.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        Ordem
                        <input
                          type="number"
                          value={editDraft.sortOrder}
                          onChange={(event) => setEditDraft((draft) => ({
                            ...draft,
                            sortOrder: event.target.value,
                          }))}
                        />
                      </label>
                    </div>
                    <label>
                      Nome
                      <input
                        required
                        minLength={3}
                        maxLength={80}
                        value={editDraft.name}
                        onChange={(event) => setEditDraft((draft) => ({
                          ...draft,
                          name: event.target.value,
                        }))}
                      />
                    </label>
                    <label>
                      Descrição
                      <textarea
                        maxLength={1200}
                        value={editDraft.description}
                        onChange={(event) => setEditDraft((draft) => ({
                          ...draft,
                          description: event.target.value,
                        }))}
                      />
                    </label>
                    <div className="category-admin-actions">
                      <button className="action primary-action" disabled={busy}>
                        <Check /> Salvar
                      </button>
                      <button
                        type="button"
                        className="action"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="category-node-main">
                      <span className="category-node-icon"><NodeIcon type={category.node_type} /></span>
                      <span>
                        <small className="category-node-type">
                          {nodeLabels[category.node_type] || 'Fórum'}
                        </small>
                        <strong>{category.name}</strong>
                        <p>{category.description || 'Área da comunidade CreativeZone.'}</p>
                      </span>
                    </div>
                    <div className="category-admin-actions">
                      <button className="action" onClick={() => onChoose?.(category)}>
                        Abrir <ChevronRight />
                      </button>
                      {isAdmin && (
                        <>
                          <button className="action" onClick={() => startEdit(category)}>
                            <Pencil /> Editar
                          </button>
                          <button
                            className="action danger-action"
                            disabled={busy}
                            onClick={() => remove(category)}
                          >
                            <Trash2 /> Excluir
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </article>
            ))}
            {!categories.length && (
              <p className="community-empty">Nenhuma categoria foi criada ainda.</p>
            )}
          </div>
        </section>

        {isAdmin && (
          <section className="category-admin-panel">
            <div className="category-section-title">
              <div>
                <span>ADMINISTRAÇÃO</span>
                <h2>Adicionar categoria principal</h2>
              </div>
              <Plus />
            </div>
            <form className="category-create-form" onSubmit={addCategory}>
              <div className="category-admin-context-note">
                <FolderTree />
                <div>
                  <strong>A criação agora segue a árvore do fórum.</strong>
                  <span>
                    Crie aqui somente categorias principais. Para adicionar uma subcategoria,
                    abra a categoria desejada e use o botão “Nova subcategoria”. Dentro de uma
                    subcategoria, use “Novo fórum”.
                  </span>
                </div>
              </div>
              <div className="category-form-grid category-form-grid-root">
                <label>
                  Ordem
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      sortOrder: event.target.value,
                    }))}
                  />
                </label>
              </div>
              <label>
                Nome
                <input
                  required
                  minLength={3}
                  maxLength={80}
                  value={form.name}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))}
                  placeholder="Ex.: Creative Design"
                />
              </label>
              <label>
                Descrição
                <textarea
                  maxLength={1200}
                  value={form.description}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))}
                  placeholder="Explique quais discussões pertencem a esta área."
                />
              </label>
              <button className="action primary-action" disabled={busy}>
                <Plus /> Criar categoria principal
              </button>
            </form>
          </section>
        )}

        {isAdmin && (
          <section className="category-suggestions-admin">
            <div className="category-section-title">
              <div>
                <span>COMUNIDADE</span>
                <h2>Sugestões de categorias</h2>
              </div>
              <select
                value={suggestionStatus}
                onChange={(event) => setSuggestionStatus(event.target.value)}
              >
                <option value="pending">Pendentes</option>
                <option value="reviewing">Em análise</option>
                <option value="approved">Aprovadas</option>
                <option value="declined">Recusadas</option>
                <option value="all">Todas</option>
              </select>
            </div>

            <div className="category-suggestion-list">
              {suggestions.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.suggested_name}</strong>
                    <span>
                      por {item.author?.display_name || item.author?.username || 'Membro'}
                    </span>
                  </div>
                  {item.description && <p>{item.description}</p>}
                  <small>
                    {new Date(item.created_at).toLocaleString('pt-BR')} · {item.status}
                  </small>
                  {item.status === 'pending' && (
                    <>
                      <label className="suggestion-placement">
                        Criar dentro de
                        <select
                          value={suggestionParents[item.id] || ''}
                          onChange={(event) => setSuggestionParents((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))}
                        >
                          <option value="">Selecione...</option>
                          {forumParents.map((parent) => (
                            <option key={parent.id} value={parent.id}>{parent.name}</option>
                          ))}
                        </select>
                      </label>
                      <div className="category-admin-actions">
                        <button
                          className="action primary-action"
                          disabled={busy}
                          onClick={() => approveAndCreate(item)}
                        >
                          <Check /> Aprovar e criar fórum
                        </button>
                        <button
                          className="action danger-action"
                          disabled={busy}
                          onClick={() => reviewSuggestion(item, 'declined')}
                        >
                          <X /> Recusar
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
              {!suggestions.length && (
                <p className="community-empty">Nenhuma sugestão nesta fila.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </Shell>
  )
}
