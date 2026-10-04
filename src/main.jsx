import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Send,
  Save,
  Link as LinkIcon,
  Smile,
  Bold,
  Italic,
  Underline,
  Film,
  EyeOff,
  Sun,
  Moon,
  LogIn,
  LogOut,
  UserPlus,
} from 'lucide-react'
import '@fontsource-variable/dm-sans'
import * as A from './design-assets'
import banner from '../assets/banner.png'
import { hasSupabaseConfig, supabase } from './services/supabaseClient'
import { signIn, signOut, signUp } from './services/authApi'
import { getProfile } from './services/profileApi'
import {
  createPost,
  createTopic,
  getCategories,
  getMembers,
  getPosts,
  getRecentPosts,
  getTopics,
} from './services/forumApi'
import { useAuth } from './hooks/useAuth'
import './styles.css'

const news = [
  'Tecnologia: acompanhe as discussões mais recentes da comunidade.',
  'Games: compartilhe novidades, dúvidas e experiências.',
  'Hardware: monte, melhore e resolva problemas do seu PC.',
  'Software: desenvolvimento, ferramentas e produtividade.',
]

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function Icon({ name }) {
  return (
    <span className={'icon icon-' + name} aria-hidden="true">
      <img src={A[name]} alt="" />
    </span>
  )
}

function Avatar({ name, mobileName, src, status, mobileStatus, small = false }) {
  const image = src || (name && A[name]) || A.daniel
  return (
    <span
      className={
        'avatar ' +
        (small ? 'small ' : '') +
        (status || '') +
        (mobileStatus ? ' mobile-' + mobileStatus : '')
      }
    >
      <picture>
        {mobileName && <source media="(max-width: 760px)" srcSet={A[mobileName]} />}
        <img src={image} alt="" />
      </picture>
      {status && <i />}
    </span>
  )
}

function Topic({ topic, onOpen, onFavorite, favorites, onMenu }) {
  const saved = favorites.includes(topic.id)
  return (
    <article className="topic">
      <button
        className="topic-open"
        onClick={() => onOpen(topic)}
        aria-label={'Abrir tópico: ' + topic.title}
      >
        <Avatar src={topic.avatarUrl} name="daniel" />
        <div className="topicbody">
          <div className="topicheading">
            <span className="authorname">{topic.user}</span>
            <span className="dash" />
            <span className="online-label">{topic.category}</span>
            <h3>{topic.title}</h3>
          </div>
          <p>{topic.description}</p>
        </div>
      </button>
      <div className="stats">
        <button
          aria-label={'Salvar ' + topic.title}
          aria-pressed={saved}
          onClick={() => onFavorite(topic.id)}
        >
          <Icon name="star" />
          <span>{saved ? 1 : 0}</span>
        </button>
        <button onClick={() => onOpen(topic)} aria-label={'Respostas de ' + topic.title}>
          <Icon name="chat" />
          <span>{topic.replies}</span>
        </button>
      </div>
      <button
        className="topicmore"
        aria-label={'Opções de ' + topic.title}
        onClick={() => onMenu(topic)}
      >
        <Icon name="more" />
      </button>
    </article>
  )
}

function Pagination({ page, setPage, total }) {
  return (
    <nav className="pagination" aria-label="Paginação">
      <button aria-label="Página anterior" disabled={page === 1} onClick={() => setPage(page - 1)}>
        <ChevronLeft />
      </button>
      <span className="mobile-counter">
        {page} de {total}
      </span>
      <span className="page-numbers">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            aria-label={'Página ' + (i + 1)}
            aria-current={page === i + 1 ? 'page' : undefined}
            className={page === i + 1 ? 'active' : ''}
            onClick={() => setPage(i + 1)}
          >
            {i + 1}
          </button>
        ))}
      </span>
      <button
        aria-label="Próxima página"
        disabled={page === total}
        onClick={() => setPage(page + 1)}
      >
        <ChevronRight />
      </button>
    </nav>
  )
}

function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef()
  useEffect(() => {
    const before = document.activeElement
    ref.current?.showModal()
    return () => before?.focus()
  }, [])

  return (
    <dialog
      ref={ref}
      className={'dialog ' + (wide ? 'wide' : '')}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => event.target === ref.current && onClose()}
      aria-label={title}
    >
      <div className="dialoghead">
        <h2>{title}</h2>
        <button aria-label="Fechar" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  )
}

function Composer({ onClose, onPublish, notify, categories }) {
  const draft = useMemo(() => readLocal('creativezone-draft', {}), [])
  const firstCategory = categories[0]?.id || ''
  const [title, setTitle] = useState(draft.title || '')
  const [categoryId, setCategoryId] = useState(draft.categoryId || firstCategory)
  const [description, setDescription] = useState(draft.description || '')
  const [publishing, setPublishing] = useState(false)
  const editor = useRef()

  useEffect(() => {
    if (!categoryId && firstCategory) setCategoryId(firstCategory)
  }, [categoryId, firstCategory])

  function save() {
    localStorage.setItem(
      'creativezone-draft',
      JSON.stringify({ title, categoryId, description })
    )
    notify('Rascunho salvo neste navegador.')
  }

  function insert(text) {
    const el = editor.current
    const start = el.selectionStart
    const end = el.selectionEnd
    setDescription(description.slice(0, start) + text + description.slice(end))
    queueMicrotask(() => el.focus())
  }

  function format(mark) {
    const el = editor.current
    const selection = description.slice(el.selectionStart, el.selectionEnd)
    insert(mark + (selection || 'texto') + mark)
  }

  async function submit(event) {
    event.preventDefault()
    setPublishing(true)
    try {
      await onPublish({
        title: title.trim(),
        categoryId,
        description: description.trim(),
      })
      localStorage.removeItem('creativezone-draft')
      onClose()
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Modal title="Adicionar novo tópico" onClose={onClose} wide>
      <form className="composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="topic-category">
          Tema
        </label>
        <select
          id="topic-category"
          required
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          {categories.map((category) => (
            <option value={category.id} key={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="topic-title">
          Título
        </label>
        <input
          id="topic-title"
          required
          maxLength={160}
          placeholder="Título do tópico"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="editor">
          <div className="toolbar">
            {[
              [Bold, 'Negrito', () => format('**')],
              [Italic, 'Itálico', () => format('_')],
              [Underline, 'Sublinhar', () => format('__')],
              [Smile, 'Inserir emoji', () => insert(' 🙂 ')],
              [Film, 'Adicionar link de vídeo', () => insert(' https:// ')],
              [LinkIcon, 'Inserir link', () => insert(' https:// ')],
              [EyeOff, 'Inserir spoiler', () => format('||')],
              [Save, 'Salvar rascunho', save],
            ].map(([ButtonIcon, label, action]) => (
              <button type="button" title={label} aria-label={label} key={label} onClick={action}>
                <ButtonIcon />
              </button>
            ))}
          </div>
          <textarea
            ref={editor}
            required
            aria-label="Descrição"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Escreva sua publicação..."
          />
        </div>
        <div className="composer-actions">
          <button
            type="submit"
            disabled={publishing || !title.trim() || !description.trim() || !categoryId}
          >
            <Send />
            {publishing ? 'Publicando...' : 'Publicar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AuthPanel({ initialMode = 'login', onClose, notify }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'signup') {
        const cleanUsername = username.trim().replace(/\s+/g, '_')
        if (cleanUsername.length < 3) {
          throw new Error('O nome de usuário precisa ter pelo menos 3 caracteres.')
        }
        const data = await signUp(email.trim(), password, {
          username: cleanUsername,
          display_name: displayName.trim() || cleanUsername,
        })
        if (!data.session) {
          notify('Cadastro criado. Confira seu e-mail para confirmar a conta.')
        } else {
          notify('Conta criada e sessão iniciada.')
        }
        onClose()
      } else {
        await signIn(email.trim(), password)
        notify('Login realizado com sucesso.')
        onClose()
      }
    } catch (authError) {
      setError(authError?.message || 'Não foi possível concluir a autenticação.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={mode === 'signup' ? 'Criar conta' : 'Entrar na CreativeZone'} onClose={onClose}>
      <div className="auth-tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
          <LogIn /> Entrar
        </button>
        <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
          <UserPlus /> Criar conta
        </button>
      </div>
      <form className="panel-content auth-form" onSubmit={submit}>
        {mode === 'signup' && (
          <>
            <label htmlFor="auth-username">Nome de usuário</label>
            <input
              id="auth-username"
              required
              minLength={3}
              maxLength={30}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="ex.: miguel"
            />
            <label htmlFor="auth-display-name">Nome exibido</label>
            <input
              id="auth-display-name"
              maxLength={60}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Como você quer aparecer"
            />
          </>
        )}
        <label htmlFor="auth-email">E-mail</label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@exemplo.com"
        />
        <label htmlFor="auth-password">Senha</label>
        <input
          id="auth-password"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Mínimo de 6 caracteres"
        />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="action auth-submit" type="submit" disabled={busy}>
          {mode === 'signup' ? <UserPlus /> : <LogIn />}
          {busy ? 'Aguarde...' : mode === 'signup' ? 'Criar conta' : 'Entrar'}
        </button>
      </form>
    </Modal>
  )
}

function App() {
  const [appearance, setAppearance] = useState(() => {
    try {
      return localStorage.getItem('creativezone-color-theme') || 'dark'
    } catch {
      return 'dark'
    }
  })
  const [favorites, setFavorites] = useState(() => readLocal('creativezone-favorites', []))
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [popularPage, setPopularPage] = useState(1)
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [reply, setReply] = useState('')
  const [topics, setTopics] = useState([])
  const [categories, setCategories] = useState([])
  const [activity, setActivity] = useState([])
  const [members, setMembers] = useState([])
  const [threadReplies, setThreadReplies] = useState([])
  const [forumLoading, setForumLoading] = useState(true)
  const [forumError, setForumError] = useState('')
  const [profile, setProfile] = useState(null)
  const mobileThemes = useRef()
  const { session, user, loading: authLoading } = useAuth()

  useEffect(() => {
    document.documentElement.dataset.theme = appearance
    try {
      localStorage.setItem('creativezone-color-theme', appearance)
    } catch {}
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', appearance === 'light' ? '#f5f5f5' : '#1a1919')
  }, [appearance])

  useEffect(() => {
    localStorage.setItem('creativezone-favorites', JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  const refreshForum = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setForumError('Supabase não configurado no build.')
      setForumLoading(false)
      return
    }

    setForumLoading(true)
    setForumError('')
    try {
      const [rawTopics, nextCategories, recentPosts, nextMembers] = await Promise.all([
        getTopics(),
        getCategories(),
        getRecentPosts(),
        getMembers(),
      ])

      setCategories(nextCategories)
      setMembers(nextMembers)
      setTopics(
        rawTopics.map((topic) => ({
          id: topic.id,
          user: topic.profiles?.display_name || topic.profiles?.username || 'Membro',
          title: topic.title,
          description: topic.content,
          category: topic.categories?.name || 'Geral',
          categoryId: topic.category_id,
          avatarUrl: topic.profiles?.avatar_url || '',
          views: topic.views || 0,
          stars: topic.views || 0,
          replies: topic.reply_count || 0,
          locked: topic.locked,
          pinned: topic.pinned,
          authorId: topic.author_id,
          createdAt: topic.created_at,
        }))
      )
      setActivity(
        recentPosts.map((post) => ({
          id: post.id,
          topicId: post.topic_id,
          user: post.profiles?.display_name || post.profiles?.username || 'Membro',
          avatarUrl: post.profiles?.avatar_url || '',
          topicTitle: post.topics?.title || 'Tópico',
          text: post.content,
          createdAt: post.created_at,
        }))
      )
    } catch (error) {
      console.error('Falha ao carregar a CreativeZone:', error)
      setForumError(error?.message || 'Não foi possível carregar o fórum.')
    } finally {
      setForumLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshForum()
  }, [refreshForum])

  useEffect(() => {
    if (!supabase) return undefined
    const channel = supabase
      .channel('creativezone-forum')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, refreshForum)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, refreshForum)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refreshForum])

  useEffect(() => {
    if (!user) {
      setProfile(null)
      return
    }
    getProfile(user.id)
      .then(setProfile)
      .catch((error) => console.error('Falha ao carregar perfil:', error))
  }, [user])

  const searched = topics.filter(
    (topic) =>
      (!filter || topic.category === filter) &&
      (!query ||
        (topic.title + ' ' + topic.user + ' ' + topic.description)
          .toLowerCase()
          .includes(query.toLowerCase()))
  )

  const total = Math.max(1, Math.ceil(searched.length / 3))
  const currentPage = Math.min(page, total)
  const recent = searched.slice((currentPage - 1) * 3, currentPage * 3)
  const popular = [...searched].sort((a, b) => b.views - a.views)
  const popularTotal = Math.max(1, Math.ceil(popular.length / 3))
  const currentPopularPage = Math.min(popularPage, popularTotal)
  const displayedPopular = popular.slice(
    (currentPopularPage - 1) * 3,
    currentPopularPage * 3
  )

  async function open(topic) {
    setSelected(topic)
    setReply('')
    setModal('topic')
    try {
      setThreadReplies(await getPosts(topic.id))
    } catch (error) {
      setThreadReplies([])
      setToast('Não foi possível carregar as respostas.')
    }
  }

  function favorite(id) {
    setFavorites((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id]
    )
  }

  function reset() {
    setQuery('')
    setFilter('')
    setPage(1)
    setPopularPage(1)
    setModal(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function publish(topic) {
    if (!session?.user) {
      setToast('Entre ou crie uma conta para publicar.')
      setModal('auth')
      throw new Error('Autenticação necessária')
    }

    try {
      await createTopic({
        title: topic.title,
        content: topic.description,
        category_id: topic.categoryId,
        author_id: session.user.id,
        slug: slugify(topic.title) + '-' + Date.now().toString(36),
      })
      setFilter('')
      setQuery('')
      setPage(1)
      await refreshForum()
      setToast('Tópico publicado na CreativeZone.')
    } catch (error) {
      setToast(error?.message || 'Não foi possível publicar o tópico.')
      throw error
    }
  }

  async function submitReply(event) {
    event.preventDefault()
    if (!reply.trim() || !selected) return

    if (!session?.user) {
      setModal('auth')
      setToast('Entre ou crie uma conta para responder.')
      return
    }

    try {
      await createPost({
        topic_id: selected.id,
        author_id: session.user.id,
        content: reply.trim(),
      })
      setReply('')
      setThreadReplies(await getPosts(selected.id))
      await refreshForum()
      setToast('Resposta publicada.')
    } catch (error) {
      setToast(error?.message || 'Não foi possível publicar a resposta.')
    }
  }

  async function leaveAccount() {
    try {
      await signOut()
      setProfile(null)
      setModal(null)
      setToast('Você saiu da sua conta.')
    } catch (error) {
      setToast(error?.message || 'Não foi possível sair.')
    }
  }

  function chooseTheme(name) {
    setFilter(name)
    setPage(1)
    setPopularPage(1)
    setModal(null)
  }

  function requireAuthForComposer() {
    if (!session?.user) {
      setModal('auth')
      setToast('Entre ou crie uma conta para abrir um tópico.')
      return
    }
    setModal('compose')
  }

  const profileName =
    profile?.display_name || profile?.username || user?.email?.split('@')[0] || 'Meu perfil'
  const profileImage = profile?.avatar_url || A.fbm

  const props = {
    onOpen: open,
    onFavorite: favorite,
    favorites,
    onMenu: (topic) => {
      setSelected(topic)
      setModal('options')
    },
  }

  return (
    <div className="app">
      <header className="header">
        <nav className="leftnav" aria-label="Principal">
          <button className="active" onClick={reset}>
            <Icon name="forum" />
            Fórum
          </button>
          <button onClick={() => setModal('members')}>
            <Icon name="members" />
            Membros
          </button>
          <button onClick={() => setModal('about')}>
            <Icon name="portal" />
            CreativeZone
          </button>
        </nav>

        <nav className="rightnav" aria-label="Ações">
          <button className="newtopic" onClick={requireAuthForComposer}>
            <Icon name="pencil" />
            Novo Tópico
          </button>
          <button className="search-trigger" onClick={() => setModal('search')}>
            <Icon name="search" />
            Buscar
          </button>
          <button
            className="theme-toggle"
            aria-label={appearance === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            title={appearance === 'dark' ? 'Tema claro' : 'Tema escuro'}
            onClick={() => setAppearance((value) => (value === 'dark' ? 'light' : 'dark'))}
          >
            {appearance === 'dark' ? <Sun /> : <Moon />}
          </button>
          <button
            className="notifications"
            aria-label="Últimas publicações"
            onClick={() => setModal('notifications')}
          >
            <Icon name="bell" />
          </button>
          <button
            className="profile"
            aria-label={session ? profileName : 'Entrar'}
            onClick={() => setModal(session ? 'profile' : 'auth')}
          >
            <img src={profileImage} alt="" />
            <ChevronDown />
          </button>
        </nav>
      </header>

      <button className="forum-banner" onClick={reset} aria-label="CreativeZone — início">
        <img src={banner} alt="CreativeZone" />
      </button>

      <div className="mobile-themes">
        <div ref={mobileThemes}>
          {categories.map((category) => (
            <button key={category.id} onClick={() => chooseTheme(category.name)}>
              {category.name}
            </button>
          ))}
        </div>
        <button
          aria-label="Ver mais temas"
          onClick={() => mobileThemes.current?.scrollBy({ left: 180, behavior: 'smooth' })}
        >
          <ChevronRight />
        </button>
      </div>

      <div className="crumb">
        <button onClick={reset}>Fórum</button>
        <ChevronRight />
        <span>{filter || 'Inicial'}</span>
      </div>

      {!hasSupabaseConfig && (
        <div className="backend-warning" role="alert">
          O build não recebeu as variáveis do Supabase.
        </div>
      )}
      {forumError && <div className="backend-warning" role="alert">{forumError}</div>}

      <main>
        <div className="maincolumn">
          <section>
            <h1>{query ? 'Resultados da busca' : filter || 'Tópicos Recentes'}</h1>
            {(query || filter) && (
              <button className="clear-filter" onClick={reset}>
                Limpar filtros ×
              </button>
            )}

            <div className="topiclist">
              {forumLoading ? (
                <p className="empty">Carregando tópicos...</p>
              ) : (
                recent.map((topic) => <Topic topic={topic} key={topic.id} {...props} />)
              )}
              {!forumLoading && !recent.length && (
                <p className="empty">
                  Ainda não há tópicos nesta área.{' '}
                  <button onClick={requireAuthForComposer}>Crie o primeiro tópico</button>.
                </p>
              )}
            </div>
            <Pagination page={currentPage} setPage={setPage} total={total} />
          </section>

          <section className="popular">
            <h2>Mais Visualizados</h2>
            <div className="desktop-topics">
              {displayedPopular.map((topic) => (
                <Topic topic={topic} key={topic.id} {...props} />
              ))}
            </div>
            <div className="mobile-topics">
              {displayedPopular.map((topic) => (
                <Topic topic={topic} key={topic.id} {...props} />
              ))}
            </div>
            <Pagination
              page={currentPopularPage}
              setPage={setPopularPage}
              total={popularTotal}
            />
          </section>

          <div className="news-grid">
            {news.map((title, index) => (
              <button key={title} onClick={() => chooseTheme(categories[index]?.name || '')}>
                <img src={A['news' + (index + 1)]} alt="" />
                <b>{title}</b>
              </button>
            ))}
          </div>
        </div>

        <aside>
          <section className="activity">
            <h2>Últimas publicações</h2>
            {activity.length ? (
              activity.map((item) => {
                const topic = topics.find((candidate) => candidate.id === item.topicId)
                return (
                  <button
                    className="activityitem"
                    key={item.id}
                    onClick={() => topic && open(topic)}
                  >
                    <Avatar src={item.avatarUrl} small />
                    <span>
                      <strong>{item.user}</strong> &gt; <strong>{item.topicTitle}</strong>
                      <br />
                      “{item.text.slice(0, 62)}{item.text.length > 62 ? '...' : ''}”
                    </span>
                  </button>
                )
              })
            ) : (
              <p className="side-empty">As respostas da comunidade aparecerão aqui.</p>
            )}
          </section>

          <section className="themes">
            <h2>
              Temas
              <button aria-label="Ver temas" onClick={() => setModal('themes')}>
                <Icon name="plus" />
              </button>
            </h2>
            {categories.map((category) => (
              <button key={category.id} onClick={() => chooseTheme(category.name)}>
                {category.name}
              </button>
            ))}
          </section>
        </aside>
      </main>

      <footer />

      <nav className="bottomnav" aria-label="Navegação mobile">
        <button aria-label="Início" onClick={reset}>
          <Icon name="home" />
        </button>
        <button aria-label="Buscar" onClick={() => setModal('search')}>
          <Icon name="mobilesearch" />
        </button>
        <button className="add-topic" aria-label="Novo tópico" onClick={requireAuthForComposer}>
          <Icon name="add" />
        </button>
        <button aria-label="Membros" onClick={() => setModal('members')}>
          <Icon name="mobilemembers" />
        </button>
        <button aria-label="Últimas publicações" onClick={() => setModal('notifications')}>
          <Icon name="feed" />
        </button>
      </nav>

      {modal === 'compose' && (
        <Composer
          onClose={() => setModal(null)}
          onPublish={publish}
          notify={setToast}
          categories={categories}
        />
      )}

      {modal === 'auth' && (
        <AuthPanel onClose={() => setModal(null)} notify={setToast} />
      )}

      {modal === 'search' && (
        <Modal title="Buscar no fórum" onClose={() => setModal(null)}>
          <form
            className="panel-content"
            onSubmit={(event) => {
              event.preventDefault()
              setPage(1)
              setPopularPage(1)
              setModal(null)
            }}
          >
            <label htmlFor="search-field">Palavra-chave ou membro</label>
            <input
              id="search-field"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              placeholder="O que você procura?"
            />
            <button className="action" type="submit">
              <Icon name="search" />
              Buscar
            </button>
          </form>
        </Modal>
      )}

      {modal === 'topic' && selected && (
        <Modal title={selected.title} onClose={() => setModal(null)} wide>
          <div className="panel-content thread">
            <div className="thread-author">
              <Avatar src={selected.avatarUrl} />
              <strong>{selected.user}</strong>
              <span>{selected.category}</span>
            </div>
            <p>{selected.description}</p>

            <div className="thread-replies">
              {threadReplies.map((post) => (
                <div key={post.id}>
                  <strong>
                    {post.profiles?.display_name || post.profiles?.username || 'Membro'}
                  </strong>
                  <p>{post.content}</p>
                </div>
              ))}
              {!threadReplies.length && (
                <p className="thread-empty">Ainda não há respostas. Seja o primeiro a responder.</p>
              )}
            </div>

            {selected.locked ? (
              <p className="thread-empty">Este tópico está bloqueado para novas respostas.</p>
            ) : (
              <form onSubmit={submitReply}>
                <label htmlFor="reply">Responder ao tópico</label>
                <textarea
                  id="reply"
                  required
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder={
                    session ? 'Escreva sua resposta...' : 'Entre para responder ao tópico.'
                  }
                  disabled={!session}
                />
                {session ? (
                  <button className="action" type="submit">
                    <Send />
                    Enviar
                  </button>
                ) : (
                  <button className="action" type="button" onClick={() => setModal('auth')}>
                    <LogIn />
                    Entrar para responder
                  </button>
                )}
              </form>
            )}
          </div>
        </Modal>
      )}

      {modal === 'members' && (
        <Modal title="Membros" onClose={() => setModal(null)}>
          <div className="panel-content members">
            {members.map((member) => (
              <div className="member-row" key={member.id}>
                <Avatar src={member.avatar_url} />
                <span>
                  <strong>{member.display_name || member.username || 'Membro'}</strong>
                  <small>{member.role === 'member' ? 'Membro' : member.role}</small>
                </span>
              </div>
            ))}
            {!members.length && <p>Ainda não há membros cadastrados.</p>}
          </div>
        </Modal>
      )}

      {modal === 'notifications' && (
        <Modal title="Últimas publicações" onClose={() => setModal(null)}>
          <div className="panel-content notification-list">
            {activity.map((item) => {
              const topic = topics.find((candidate) => candidate.id === item.topicId)
              return (
                <button key={item.id} onClick={() => topic && open(topic)}>
                  <Avatar src={item.avatarUrl} small />
                  <span>
                    <strong>{item.user} &gt; {item.topicTitle}</strong>
                    <br />
                    {item.text}
                  </span>
                </button>
              )
            })}
            {!activity.length && <p>Ainda não há publicações recentes.</p>}
          </div>
        </Modal>
      )}

      {modal === 'themes' && (
        <Modal title="Escolha um tema" onClose={() => setModal(null)}>
          <div className="panel-content theme-options">
            {categories.map((category) => (
              <button key={category.id} onClick={() => chooseTheme(category.name)}>
                <strong>{category.name}</strong>
                {category.description && <small>{category.description}</small>}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modal === 'profile' && session && (
        <Modal title="Meu perfil" onClose={() => setModal(null)}>
          <div className="panel-content">
            <div className="thread-author">
              <Avatar src={profile?.avatar_url} />
              <div>
                <strong>{profileName}</strong>
                <p className="profile-email">{session.user.email}</p>
              </div>
            </div>
            <p>
              {topics.filter((topic) => topic.authorId === session.user.id).length} tópicos publicados
              {' · '}
              {favorites.length} salvos
            </p>
            <div className="profile-actions">
              <button className="action" onClick={() => setModal('compose')}>
                Criar tópico
              </button>
              <button className="action" onClick={leaveAccount}>
                <LogOut />
                Sair
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'options' && selected && (
        <Modal title="Opções do tópico" onClose={() => setModal(null)}>
          <div className="panel-content theme-options">
            <button
              onClick={() => {
                favorite(selected.id)
                setModal(null)
              }}
            >
              {favorites.includes(selected.id) ? 'Remover dos salvos' : 'Salvar tópico'}
            </button>
            <button onClick={() => open(selected)}>Abrir discussão</button>
          </div>
        </Modal>
      )}

      {modal === 'about' && (
        <Modal title="CreativeZone" onClose={() => setModal(null)}>
          <div className="panel-content">
            <p>
              Comunidade CreativeZone para tecnologia, software, hardware, games e troca de
              conhecimento entre membros.
            </p>
          </div>
        </Modal>
      )}

      {authLoading && <div className="toast" role="status">Verificando sessão...</div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
