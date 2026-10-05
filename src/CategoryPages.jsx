import React, { useEffect, useState } from 'react'
import {
  Check,
  Lightbulb,
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
                <strong>Qual categoria está faltando?</strong>
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
              Por que essa categoria seria útil?
              <textarea
                maxLength={1200}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Explique o tipo de discussão que deveria ficar nessa categoria."
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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({ name: '', description: '' })
  const [suggestions, setSuggestions] = useState([])
  const [suggestionStatus, setSuggestionStatus] = useState('pending')
  const [busy, setBusy] = useState(false)

  async function loadSuggestions() {
    if (!isAdmin) return
    try {
      setSuggestions(await getCategorySuggestions(suggestionStatus))
    } catch (error) {
      notify?.(error?.message || 'Não foi possível carregar as sugestões.')
    }
  }

  useEffect(() => {
    loadSuggestions()
  }, [isAdmin, suggestionStatus])

  async function addCategory(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await createCategory({ name, description })
      setName('')
      setDescription('')
      await onChanged?.()
      notify?.('Categoria criada.')
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
    })
  }

  async function saveEdit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await updateCategory(editingId, editDraft)
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
    if (!window.confirm(`Excluir a categoria “${category.name}”?\n\nCategorias com tópicos não podem ser removidas até que o conteúdo seja movido ou excluído.`)) {
      return
    }

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
    setBusy(true)
    try {
      await createCategory({
        name: item.suggested_name,
        description: item.description,
      })
      await reviewCategorySuggestion({
        suggestionId: item.id,
        reviewerId: session.user.id,
        status: 'approved',
        adminNote: 'Categoria criada a partir desta sugestão.',
      })
      await Promise.all([onChanged?.(), loadSuggestions()])
      notify?.('Sugestão aprovada e categoria criada.')
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
          <span>CATEGORIAS DO FÓRUM</span>
          <h2>Organize as conversas sem engessar a comunidade.</h2>
          <p>
            As categorias existem para manter os tópicos fáceis de encontrar. Quando um assunto
            novo ganhar espaço suficiente, os membros podem sugerir uma nova categoria para a
            administração.
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
              <span>ATIVAS</span>
              <h2>Categorias disponíveis</h2>
            </div>
            <b>{categories.length}</b>
          </div>

          <div className="category-directory-list">
            {categories.map((category) => (
              <article className="category-directory-card" key={category.id}>
                {editingId === category.id ? (
                  <form className="category-inline-edit" onSubmit={saveEdit}>
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
                    <div>
                      <strong>{category.name}</strong>
                      <p>{category.description || 'Categoria da comunidade CreativeZone.'}</p>
                    </div>
                    <div className="category-admin-actions">
                      <button className="action" onClick={() => onChoose?.(category.name)}>
                        Abrir tópicos
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
                <h2>Adicionar categoria</h2>
              </div>
              <Plus />
            </div>
            <form className="category-create-form" onSubmit={addCategory}>
              <label>
                Nome
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
                Descrição
                <textarea
                  maxLength={1200}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Explique quais discussões pertencem a esta categoria."
                />
              </label>
              <button className="action primary-action" disabled={busy}>
                <Plus /> Criar categoria
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
                    <div className="category-admin-actions">
                      <button
                        className="action primary-action"
                        disabled={busy}
                        onClick={() => approveAndCreate(item)}
                      >
                        <Check /> Aprovar e criar
                      </button>
                      <button
                        className="action danger-action"
                        disabled={busy}
                        onClick={() => reviewSuggestion(item, 'declined')}
                      >
                        <X /> Recusar
                      </button>
                    </div>
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
