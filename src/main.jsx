import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Send,
  Save,
  Sun,
  Moon,
  LogIn,
  LogOut,
  UserPlus,
  Quote,
  X,
  Paperclip,
  Edit3,
  Trash2,
  Briefcase,
  Bell,
  BellOff,
  CheckCircle2,
  Users,
  Download,
  LockKeyhole,
} from 'lucide-react'
import '@fontsource-variable/dm-sans'
import * as A from './design-assets'
import banner from '../assets/banner.png'
import bannerLight from '../assets/bannerB.png'
import logo from '../assets/logo.png'
import googleIcon from '../assets/google.png'
import githubIcon from '../assets/github.png'
import { hasSupabaseConfig, supabase } from './services/supabaseClient'
import { getAuthErrorMessage, signIn, signInWithOAuthProvider, signOut, signUp } from './services/authApi'
import { getProfile } from './services/profileApi'
import {
  createPost,
  createTopic,
  getCategories,
  getMembers,
  getPosts,
  getRecentPosts,
  getTopicById,
  getTopicsPage,
  searchForum,
  updateTopic,
  deleteTopic,
  updatePost,
  deletePost,
  getForumAuthorStats,
  isWatchingTopic,
  watchTopic,
  unwatchTopic,
} from './services/forumApi'
import { useAuth } from './hooks/useAuth'
import {
  AccountPage,
  MessagesPage,
  NotificationsPanel,
  PublicProfilePage,
  ReactionButton,
  UserQuickMenu,
} from './CommunityPages'
import {
  ModerationPage,
  ProjectPage,
  ProjectsPage,
  ReportButton,
} from './ExtendedCommunityPages'
import { PasswordRecoveryPage } from './AuthRecoveryPages'
import { ThreadPostCard } from './ForumThreadComponents'
import { ForumNodePage } from './ForumNodePage'
import { ForumIndex } from './ForumIndex'
import { CommunityChat } from './CommunityChat'
import { CategoriesPage, CategorySuggestionButton } from './CategoryPages'
import {
  getPostMedia,
  getTopicMedia,
  isImageMedia,
  uploadForumMedia,
} from './services/mediaApi'
import {
  createTopicDownloads,
  deleteTopicDownload,
  getTopicDownloads,
  resolveTopicDownload,
  updateTopicDownloadAccess,
} from './services/downloadApi'
import {
  getAccountSettings,
  getBookmarkIds,
  getIgnored,
  registerDeviceSession,
  registerLoginDay,
  toggleBookmark,
  touchLastSeen,
} from './services/communityApi'
import { getPageCount, slugify } from './utils/forumUtils'
import { ProfessionalEditor, RichForumContent } from './ProfessionalEditor'
import { EliteAreaPage } from './MembershipSection'
import { AdminDashboard } from './AdminDashboard'
import { getMemberDecorations, getMembershipState } from './services/membershipApi'
import { EffectBadge, EffectName, EffectRole } from './VisualEffects'
import {
  AchievementsPage,
  AdvancedSearchPage,
  PersonalizedFeed,
  RankingsPage,
  TagPage,
} from './CommunityFeatures'
import {
  getRelatedTopics,
  getTopicTags,
  markAcceptedAnswer,
  recordTopicView,
  setTopicTags,
} from './services/communityFeaturesApi'
import './styles.css'
import './effects-v2.css'

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function mapTopic(topic) {
  if (!topic) return null
  return {
    id: topic.id,
    user:
      topic.author_display_name ||
      topic.profiles?.display_name ||
      topic.author_username ||
      topic.profiles?.username ||
      'Membro',
    title: topic.title,
    description: topic.content,
    category: topic.category_name || topic.categories?.name || 'Geral',
    categoryId: topic.category_id,
    avatarUrl: topic.author_avatar_url || topic.profiles?.avatar_url || '',
    views: topic.views || 0,
    stars: topic.views || 0,
    replies: Number(topic.reply_count || 0),
    locked: Boolean(topic.locked),
    pinned: Boolean(topic.pinned),
    authorId: topic.author_id,
    authorUsername: topic.author_username || topic.profiles?.username || '',
    signature: topic.author_signature || topic.profiles?.signature || '',
    profile: topic.profiles || null,
    createdAt: topic.created_at,
    updatedAt: topic.updated_at,
    acceptedAnswerId: topic.accepted_answer_id || null,
  }
}

function getCategoryPath(categories, categoryId) {
  if (!categoryId) return []
  const byId = new Map((categories || []).map((item) => [item.id, item]))
  const path = []
  const seen = new Set()
  let current = byId.get(categoryId)

  while (current && !seen.has(current.id) && path.length < 8) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parent_id ? byId.get(current.parent_id) : null
  }

  return path
}

function flattenCategoryTree(categories) {
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
    for (const category of byParent.get(parentId) || []) {
      result.push({ ...category, depth })
      walk(category.id, depth + 1)
    }
  }
  walk('root', 0)
  return result
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

function ForumText({ content = '' }) {
  return <RichForumContent content={content} />
}

function ForumMediaList({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="forum-media-list">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.signed_url || '#'}
          target="_blank"
          rel="noreferrer"
          className={'forum-media-item ' + (isImageMedia(item) ? 'image' : 'file')}
        >
          {isImageMedia(item) && item.signed_url ? (
            <img src={item.signed_url} alt={item.original_name || 'Anexo'} />
          ) : (
            <Paperclip />
          )}
          <span>{item.original_name || 'Anexo'}</span>
        </a>
      ))}
    </div>
  )
}

function ProtectedDownloads({
  items = [],
  session,
  profile,
  membershipState,
  navigate,
  notify,
  onRefresh,
}) {
  const isOwner = Boolean(profile?.system_owner)
  const hasPaidPlan = isOwner || Number(membershipState?.rank || 0) >= 1

  if (!items.length) return null

  async function openDownload(item) {
    if (!session?.user) {
      notify?.('Crie uma conta ou entre para acessar downloads.')
      navigate('/cadastro')
      return
    }

    if (item.access_scope === 'paid' && !hasPaidPlan) {
      notify?.('Este download é exclusivo para assinantes PRO e ELITE.')
      navigate('/conta/assinatura')
      return
    }

    try {
      const targetUrl = await resolveTopicDownload(item.id)
      const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer')
      if (!opened) window.location.assign(targetUrl)
    } catch (error) {
      notify?.(error?.message || 'Não foi possível liberar este download.')
    }
  }

  async function changeAccess(item, accessScope) {
    try {
      await updateTopicDownloadAccess(item.id, accessScope)
      await onRefresh?.()
      notify?.('Permissão do download atualizada.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível alterar a permissão do download.')
    }
  }

  async function removeDownload(item) {
    if (!window.confirm(`Remover o download “${item.label}” deste tópico?`)) return
    try {
      await deleteTopicDownload(item.id)
      await onRefresh?.()
      notify?.('Download removido do tópico.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível remover o download.')
    }
  }

  return (
    <section className="protected-downloads">
      <header>
        <div>
          <Download />
          <span>
            <strong>Downloads</strong>
            <small>O tópico é público; o arquivo segue a permissão definida pelo proprietário.</small>
          </span>
        </div>
        <b>{items.length}</b>
      </header>

      <div className="protected-download-list">
        {items.map((item) => {
          const paidOnly = item.access_scope === 'paid'
          const allowed = Boolean(session?.user) && (!paidOnly || hasPaidPlan)
          return (
            <article key={item.id} className={paidOnly ? 'paid-only' : 'members-only'}>
              <div className="protected-download-main">
                <span className="protected-download-icon">
                  {paidOnly ? <LockKeyhole /> : <Download />}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>
                    {paidOnly
                      ? 'Exclusivo para assinantes PRO e ELITE'
                      : 'Disponível para qualquer membro registrado'}
                  </small>
                </span>
              </div>

              <div className="protected-download-actions">
                {isOwner && (
                  <select
                    value={item.access_scope}
                    onChange={(event) => changeAccess(item, event.target.value)}
                    aria-label={'Permissão de ' + item.label}
                  >
                    <option value="member">Membros registrados</option>
                    <option value="paid">PRO + ELITE</option>
                  </select>
                )}

                <button
                  type="button"
                  className={'action protected-download-button ' + (allowed ? 'unlocked' : 'locked')}
                  onClick={() => openDownload(item)}
                >
                  {allowed ? <Download /> : <LockKeyhole />}
                  {!session?.user
                    ? 'Criar conta para baixar'
                    : paidOnly && !hasPaidPlan
                      ? 'Requer PRO / ELITE'
                      : 'Baixar'}
                </button>

                {isOwner && (
                  <button
                    type="button"
                    className="action danger-action protected-download-delete"
                    onClick={() => removeDownload(item)}
                  >
                    <Trash2 />
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
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
        aria-label={'Abrir ' + topic.title}
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

function OverlayPanel({ title, onClose, children, wide = false, variant = '' }) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className={'overlay-backdrop ' + (variant ? 'overlay-backdrop-' + variant : '')}
      onMouseDown={onClose}
    >
      <section
        className={'overlay-panel ' + (wide ? 'wide ' : '') + (variant ? 'overlay-panel-' + variant : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="overlay-head">
          <h2>{title}</h2>
          <button aria-label="Fechar" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

function PageShell({ title, children, onBack, wide = false, full = false }) {
  return (
    <section
      className={
        'standalone-page ' +
        (wide ? 'wide-page ' : '') +
        (full ? 'full-page' : '')
      }
    >
      <div className="page-card">
        <div className="page-titlebar">
          <div>
            <button className="page-back" onClick={onBack}>
              <ChevronLeft />
              Voltar
            </button>
            <h1>{title}</h1>
          </div>
        </div>
        {children}
      </div>
    </section>
  )
}

function ComposerPage({ onPublish, notify, categories, navigate, session, profile, membershipState }) {
  const draft = useMemo(() => readLocal('creativezone-draft', {}), [])
  const firstCategory = categories[0]?.id || ''
  const [title, setTitle] = useState(draft.title || '')
  const [categoryId, setCategoryId] = useState(draft.categoryId || firstCategory)
  const [description, setDescription] = useState(draft.description || '')
  const [tagText, setTagText] = useState((draft.tags || []).join(', '))
  const [attachments, setAttachments] = useState([])
  const [downloads, setDownloads] = useState(
    profile?.system_owner && Array.isArray(draft.downloads) ? draft.downloads : []
  )
  const [publishing, setPublishing] = useState(false)
  const canManageDownloads = Boolean(profile?.system_owner)

  useEffect(() => {
    if (!categoryId && firstCategory) setCategoryId(firstCategory)
  }, [categoryId, firstCategory])

  function parsedTags() {
    return [...new Set(
      tagText.split(',').map((value) => value.replace(/^#+/, '').trim()).filter(Boolean)
    )].slice(0,6)
  }

  function addDownload() {
    setDownloads((items) => [
      ...items,
      {
        id: globalThis.crypto?.randomUUID?.() || 'download-' + Date.now().toString(36),
        label: '',
        url: '',
        accessScope: 'member',
      },
    ])
  }

  function updateDownload(id, changes) {
    setDownloads((items) => items.map((item) => (
      item.id === id ? { ...item, ...changes } : item
    )))
  }

  function removeDownload(id) {
    setDownloads((items) => items.filter((item) => item.id !== id))
  }

  function save() {
    localStorage.setItem(
      'creativezone-draft',
      JSON.stringify({
        title,
        categoryId,
        description,
        tags: parsedTags(),
        downloads: canManageDownloads ? downloads : [],
      })
    )
    notify('Rascunho salvo neste navegador.')
  }

  async function submit(event) {
    event.preventDefault()
    setPublishing(true)
    try {
      await onPublish({
        title: title.trim(),
        categoryId,
        description: description.trim(),
        tags: parsedTags(),
        attachments,
        downloads: canManageDownloads
          ? downloads
              .map((item) => ({
                label: String(item.label || '').trim(),
                url: String(item.url || '').trim(),
                accessScope: item.accessScope === 'paid' ? 'paid' : 'member',
              }))
              .filter((item) => item.label && item.url)
          : [],
      })
      localStorage.removeItem('creativezone-draft')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <PageShell title="Adicionar novo tópico" onBack={() => navigate('/')} wide>
      <form className="composer standalone-composer professional-composer" onSubmit={submit}>
        <label htmlFor="topic-category">Categoria</label>
        <select id="topic-category" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>{category.pathLabel || category.name}</option>
          ))}
        </select>
        <div className="composer-category-help">
          <small>Não encontrou a categoria certa para sua publicação?</small>
          <CategorySuggestionButton session={session} navigate={navigate} notify={notify} label="Sugerir nova categoria" />
        </div>

        <label htmlFor="topic-title">Título</label>
        <input id="topic-title" required maxLength={160} placeholder="Título do tópico" value={title} onChange={(event) => setTitle(event.target.value)} />

        <label htmlFor="topic-tags">Tags</label>
        <input
          id="topic-tags"
          maxLength={240}
          placeholder="#React, #IA, #Python, #Cloud"
          value={tagText}
          onChange={(event) => setTagText(event.target.value)}
        />
        <small className="field-help">Até 6 tags separadas por vírgula. Elas alimentam recomendações e tópicos relacionados.</small>

        <label htmlFor="topic-description">Mensagem</label>
        <ProfessionalEditor
          id="topic-description"
          value={description}
          onChange={setDescription}
          files={attachments}
          onFilesChange={setAttachments}
          maxFiles={membershipState?.entitlements?.forum_upload_count || 4}
          maxBytes={(membershipState?.entitlements?.forum_upload_mb || 10) * 1024 * 1024}
          required
          maxLength={12000}
          placeholder="Escreva sua publicação em Markdown. Links do YouTube, GitHub, CodePen e imagens são incorporados automaticamente."
        />

        {canManageDownloads && (
          <section className="composer-protected-downloads">
            <header>
              <div>
                <LockKeyhole />
                <span>
                  <strong>Downloads protegidos</strong>
                  <small>
                    O texto do tópico continuará público. O link real só será liberado para quem atender à permissão escolhida.
                  </small>
                </span>
              </div>
              <button type="button" className="action" onClick={addDownload}>
                <Plus /> Adicionar download
              </button>
            </header>

            {downloads.length ? (
              <div className="composer-download-list">
                {downloads.map((item, index) => (
                  <article key={item.id}>
                    <div className="composer-download-number">{index + 1}</div>

                    <label>
                      Nome do arquivo
                      <input
                        value={item.label}
                        onChange={(event) => updateDownload(item.id, { label: event.target.value })}
                        maxLength={120}
                        placeholder="Ex.: Adobe Audition 2024 24.0.3.3 (x64)"
                      />
                    </label>

                    <label className="composer-download-url">
                      Link do download
                      <input
                        type="url"
                        value={item.url}
                        onChange={(event) => updateDownload(item.id, { url: event.target.value })}
                        placeholder="https://..."
                      />
                    </label>

                    <label>
                      Quem pode baixar?
                      <select
                        value={item.accessScope}
                        onChange={(event) => updateDownload(item.id, { accessScope: event.target.value })}
                      >
                        <option value="member">Qualquer membro registrado</option>
                        <option value="paid">Somente PRO + ELITE</option>
                      </select>
                    </label>

                    <button
                      type="button"
                      className="action danger-action composer-download-remove"
                      onClick={() => removeDownload(item.id)}
                      aria-label={'Remover download ' + (index + 1)}
                    >
                      <Trash2 />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="composer-download-empty">
                Nenhum link protegido adicionado. Use “Adicionar download” se este tópico distribuir arquivos.
              </p>
            )}

            <p className="composer-download-security-note">
              O endereço externo não é incluído no conteúdo público do tópico. O Supabase libera o destino apenas após validar a conta e, quando necessário, a assinatura PRO/ELITE.
            </p>
          </section>
        )}

        <div className="composer-submit-row">
          <button className="action" type="button" onClick={save}><Save /> Salvar rascunho</button>
          <button className="publish" type="submit" disabled={publishing}>
            <Send /> {publishing ? 'Publicando...' : 'Publicar tópico'}
          </button>
        </div>
      </form>
    </PageShell>
  )
}

function AuthPage({ mode, navigate, notify }) {
  const isSignup = mode === 'signup'
  const [tab, setTab] = useState(mode)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [oauthProvider, setOauthProvider] = useState('')

  useEffect(() => setTab(mode), [mode])

  async function handleOAuth(provider) {
    setError('')
    setOauthProvider(provider)
    try {
      await signInWithOAuthProvider(provider, window.location.origin + '/')
    } catch (authError) {
      const message = getAuthErrorMessage(authError)
      setError(message)
      notify(message)
      setOauthProvider('')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      if (tab === 'signup') {
        const compromised = await checkCompromisedPassword(password)
        if (compromised) {
          throw new Error(
            'Esta senha foi bloqueada porque já apareceu em vazamentos de dados. Escolha uma senha nova e exclusiva.'
          )
        }
        await signUp({
          email,
          password,
          username,
          displayName,
        })
        notify('Conta criada. Sua sessão será iniciada automaticamente quando permitido pelo provedor.')
      } else {
        await signIn({ email, password })
        notify('Login realizado com sucesso.')
      }
      navigate('/')
    } catch (authError) {
      const message = getAuthErrorMessage(authError)
      setError(message)
      notify(message)
    } finally {
      setBusy(false)
    }
  }

  function switchMode(nextMode) {
    setTab(nextMode)
    setError('')
    navigate(nextMode === 'signup' ? '/cadastro' : '/entrar')
  }

  return (
    <PageShell
      title={isSignup ? 'Criar conta na CreativeZone' : 'Entrar na CreativeZone'}
      onBack={() => navigate('/')}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-tabs">
          <button
            type="button"
            className={tab === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            <LogIn />
            Entrar
          </button>
          <button
            type="button"
            className={tab === 'signup' ? 'active' : ''}
            onClick={() => switchMode('signup')}
          >
            <UserPlus />
            Criar conta
          </button>
        </div>

        <div className="oauth-actions">
          <button type="button" onClick={() => handleOAuth('google')} disabled={Boolean(oauthProvider)}>
            <img src={googleIcon} alt="" />
            {oauthProvider === 'google' ? 'Conectando...' : 'Continuar com Google'}
          </button>
          <button type="button" onClick={() => handleOAuth('github')} disabled={Boolean(oauthProvider)}>
            <img src={githubIcon} alt="" />
            {oauthProvider === 'github' ? 'Conectando...' : 'Continuar com GitHub'}
          </button>
        </div>

        <div className="auth-divider"><span>ou use e-mail e senha</span></div>

        {tab === 'signup' && (
          <>
            <label htmlFor="auth-username">Nome de usuário</label>
            <input
              id="auth-username"
              required
              minLength={3}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="ex.: miguel"
            />

            <label htmlFor="auth-display-name">Nome exibido</label>
            <input
              id="auth-display-name"
              required
              minLength={2}
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
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required
          minLength={10}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Mínimo de 10 caracteres"
        />

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button className="action auth-submit" type="submit" disabled={busy}>
          {isSignup ? <UserPlus /> : <LogIn />}
          {busy ? 'Aguarde...' : isSignup ? 'Criar conta' : 'Entrar'}
        </button>
        {!isSignup && (
          <button className="forgot-password-link" type="button" onClick={() => navigate('/esqueci-senha')}>
            Esqueci minha senha
          </button>
        )}
      </form>
    </PageShell>
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
  const [path, setPath] = useState(() => window.location.pathname || '/')
  const [favorites, setFavorites] = useState([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [popularPage, setPopularPage] = useState(1)
  const [toast, setToast] = useState('')
  const [overlay, setOverlay] = useState(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [topics, setTopics] = useState([])
  const [popularTopics, setPopularTopics] = useState([])
  const [topicCount, setTopicCount] = useState(0)
  const [popularTopicCount, setPopularTopicCount] = useState(0)
  const [routeTopic, setRouteTopic] = useState(null)
  const [routeTags, setRouteTags] = useState([])
  const [relatedTopics, setRelatedTopics] = useState([])
  const [topicViewers, setTopicViewers] = useState([])
  const [threadAuthorStats, setThreadAuthorStats] = useState({})
  const [threadDecorations, setThreadDecorations] = useState({})
  const [membershipState, setMembershipState] = useState(null)
  const [watchingTopic, setWatchingTopic] = useState(false)
  const [watchBusy, setWatchBusy] = useState(false)
  const [topicMedia, setTopicMedia] = useState([])
  const [topicDownloads, setTopicDownloads] = useState([])
  const [postMedia, setPostMedia] = useState({})
  const [replyFiles, setReplyFiles] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [editingTopic, setEditingTopic] = useState(false)
  const [editingTopicDraft, setEditingTopicDraft] = useState({ title: '', content: '', categoryId: '' })
  const [editingPostId, setEditingPostId] = useState(null)
  const [editingPostText, setEditingPostText] = useState('')
  const [categories, setCategories] = useState([])
  const [activity, setActivity] = useState([])
  const [members, setMembers] = useState([])
  const [memberDecorations, setMemberDecorations] = useState({})
  const [threadReplies, setThreadReplies] = useState([])
  const [forumLoading, setForumLoading] = useState(true)
  const [forumError, setForumError] = useState('')
  const [profile, setProfile] = useState(null)
  const [forumOnlineMembers, setForumOnlineMembers] = useState([])
  const [ignoredIds, setIgnoredIds] = useState([])
  const mobileThemes = useRef()
  const { session, user, loading: authLoading } = useAuth()

  useEffect(() => {
    const ids = [...new Set(members.map((member) => member.id).filter(Boolean))]
    let active = true

    if (!ids.length) {
      setMemberDecorations({})
      return undefined
    }

    getMemberDecorations(ids)
      .then((next) => { if (active) setMemberDecorations(next) })
      .catch(() => { if (active) setMemberDecorations({}) })

    return () => { active = false }
  }, [members])

  const navigate = useCallback((nextPath) => {
    setUserMenuOpen(false)
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }
    setPath(nextPath)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname || '/')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = appearance
    try {
      localStorage.setItem('creativezone-color-theme', appearance)
    } catch {}
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', appearance === 'light' ? '#f5f5f5' : '#1a1919')
  }, [appearance])

  useEffect(() => {
    if (!user?.id) {
      setFavorites([])
      setIgnoredIds([])
      return
    }
    getBookmarkIds(user.id).then(setFavorites).catch(() => setFavorites([]))
    getIgnored(user.id)
      .then((rows) => setIgnoredIds(rows.map((row) => row.ignored_id || row.profile?.id).filter(Boolean)))
      .catch(() => setIgnoredIds([]))
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    touchLastSeen(user.id).catch(() => {})
    const timer = setInterval(() => touchLastSeen(user.id).catch(() => {}), 60_000)
    return () => clearInterval(timer)
  }, [user?.id])

  const refreshForum = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setForumError(
        'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY) para carregar o fórum.'
      )
      setForumLoading(false)
      return
    }

    setForumLoading(true)
    setForumError('')

    try {
      const selectedCategory = categories.find((category) => category.name === filter)?.id || null
      const [
        categoryRows,
        recentPage,
        popularPageData,
        recentPosts,
        memberRows,
      ] = await Promise.all([
        getCategories(),
        getTopicsPage({ page, pageSize: 3, query, categoryId: selectedCategory, ignoredIds }),
        getTopicsPage({ page: popularPage, pageSize: 3, query, categoryId: selectedCategory, sort: 'popular', ignoredIds }),
        getRecentPosts(),
        getMembers(),
      ])

      setCategories(categoryRows)
      setMembers(memberRows)
      setTopics((recentPage.items || []).map(mapTopic))
      setPopularTopics((popularPageData.items || []).map(mapTopic))
      setTopicCount(recentPage.total || 0)
      setPopularTopicCount(popularPageData.total || 0)
      setActivity(
        recentPosts.map((post) => ({
          id: post.id,
          topicId: post.topic_id,
          user: post.profiles?.display_name || post.profiles?.username || 'Membro',
          authorId: post.profiles?.id || null,
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
  }, [page, popularPage, query, filter, ignoredIds])

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

  useEffect(() => {
    if (!user?.id) {
      setMembershipState(null)
      return
    }
    getMembershipState(user.id)
      .then(setMembershipState)
      .catch(() => setMembershipState(null))
  }, [user?.id])

  useEffect(() => {
    if (!supabase) {
      setForumOnlineMembers([])
      return undefined
    }

    const options = user?.id
      ? { config: { presence: { key: user.id } } }
      : undefined

    const channel = supabase.channel('creativezone-forum-presence-v1', options)

    const syncPresence = () => {
      const byUser = new Map()

      Object.values(channel.presenceState() || {}).flat().forEach((presence) => {
        if (!presence?.user_id) return
        if (!byUser.has(presence.user_id)) byUser.set(presence.user_id, presence)
      })

      setForumOnlineMembers(
        [...byUser.values()].sort((a, b) =>
          String(a.display_name || a.username || '').localeCompare(
            String(b.display_name || b.username || ''),
            'pt-BR',
            { sensitivity: 'base' }
          )
        )
      )
    }

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || !user?.id || !profile || profile.show_online === false) return

        try {
          await channel.track({
            user_id: user.id,
            username: profile.username,
            display_name: profile.display_name || profile.username || 'Membro',
            avatar_url: profile.avatar_url || '',
            role: profile.role || 'member',
            online_at: new Date().toISOString(),
          })
        } catch (error) {
          console.error('Falha ao publicar presença no fórum:', error)
        }
      })

    return () => {
      if (user?.id) channel.untrack().catch(() => {})
      supabase.removeChannel(channel)
    }
  }, [
    user?.id,
    profile?.username,
    profile?.display_name,
    profile?.avatar_url,
    profile?.role,
    profile?.show_online,
  ])

  useEffect(() => {
    if (!user?.id) return
    getAccountSettings(user.id)
      .then((settings) => {
        const nextTheme =
          settings.theme === 'system'
            ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
            : settings.theme
        if (nextTheme) setAppearance(nextTheme)
        document.documentElement.dataset.density = settings.density || 'comfortable'
      })
      .catch(() => {})

    registerLoginDay().catch(() => {})
    registerDeviceSession(user.id).catch(() => {})
  }, [user?.id])

  useEffect(() => {
    if (authLoading || !session?.user || !profile) return

    if (profile.account_status === 'deactivated') {
      if (path !== '/conta/seguranca') {
        setToast('Sua conta está desativada. Reative-a para voltar a usar a CreativeZone.')
        navigate('/conta/seguranca')
      }
      return
    }

    if (profile.profile_completed) return
    if (path === '/conta/perfil' || path === '/perfil') return
    setToast('Complete os campos obrigatórios do seu perfil para continuar.')
    navigate('/conta/perfil')
  }, [
    authLoading,
    session?.user?.id,
    profile?.profile_completed,
    profile?.account_status,
    path,
    navigate,
  ])

  const topicMatch = path.match(/^\/topico\/([^/]+)$/)
  const routeTopicId = topicMatch ? decodeURIComponent(topicMatch[1]) : null

  const refreshTopicDownloads = useCallback(async () => {
    if (!routeTopicId) {
      setTopicDownloads([])
      return
    }
    try {
      setTopicDownloads(await getTopicDownloads(routeTopicId))
    } catch (error) {
      setTopicDownloads([])
      setToast(error?.message || 'Não foi possível atualizar os downloads deste tópico.')
    }
  }, [routeTopicId])

  const forumMatch = path.match(/^\/forum\/([^/]+)$/)
  const routeForumSlug = forumMatch ? decodeURIComponent(forumMatch[1]) : null
  const memberMatch = path.match(/^\/membro\/([^/]+)$/)
  const routeMemberUsername = memberMatch ? decodeURIComponent(memberMatch[1]) : null
  const accountMatch = path.match(/^\/conta(?:\/([^/]+))?$/)
  const accountSection = accountMatch ? (accountMatch[1] || 'perfil') : null
  const messagesMatch = path.match(/^\/mensagens(?:\/([^/]+))?$/)
  const messageUsername = messagesMatch?.[1] ? decodeURIComponent(messagesMatch[1]) : null
  const projectMatch = path.match(/^\/projetos\/([^/]+)$/)
  const routeProjectSlug = projectMatch?.[1] ? decodeURIComponent(projectMatch[1]) : null
  const tagMatch = path.match(/^\/tag\/([^/]+)$/)
  const routeTagSlug = tagMatch?.[1] ? decodeURIComponent(tagMatch[1]) : null

  useEffect(() => {
    let cancelled = false

    async function loadThread() {
      if (!routeTopicId) {
        setRouteTopic(null)
        setThreadReplies([])
        setThreadAuthorStats({})
        setThreadDecorations({})
        setWatchingTopic(false)
        setTopicMedia([])
        setTopicDownloads([])
        setPostMedia({})
        setRouteTags([])
        setRelatedTopics([])
        setTopicViewers([])
        return
      }

      try {
        const [rawTopic, posts, media, downloads, tags, related] = await Promise.all([
          getTopicById(routeTopicId),
          getPosts(routeTopicId),
          getTopicMedia(routeTopicId),
          getTopicDownloads(routeTopicId),
          getTopicTags(routeTopicId),
          getRelatedTopics(routeTopicId).catch(() => []),
        ])
        if (cancelled) return
        setRouteTopic(mapTopic(rawTopic))
        setThreadReplies(posts)
        setTopicMedia(media)
        setTopicDownloads(downloads)
        setRouteTags(tags)
        setRelatedTopics(related)

        const authorIds = [
          rawTopic?.author_id,
          ...posts.map((post) => post.author_id),
        ].filter(Boolean)
        const [stats, decorations] = await Promise.all([
          getForumAuthorStats(authorIds),
          getMemberDecorations(authorIds).catch(() => ({})),
        ])
        if (!cancelled) {
          setThreadAuthorStats(stats)
          setThreadDecorations(decorations)
        }

        const pairs = await Promise.all(
          posts.map(async (post) => {
            try {
              return [post.id, await getPostMedia(post.id)]
            } catch {
              return [post.id, []]
            }
          })
        )
        if (!cancelled) setPostMedia(Object.fromEntries(pairs))
      } catch {
        if (!cancelled) {
          setRouteTopic(null)
          setThreadReplies([])
          setThreadAuthorStats({})
          setThreadDecorations({})
          setTopicMedia([])
          setTopicDownloads([])
          setPostMedia({})
          setRouteTags([])
          setRelatedTopics([])
          setToast('Não foi possível carregar o tópico.')
        }
      }
    }

    loadThread()
    return () => { cancelled = true }
  }, [routeTopicId])

  useEffect(() => {
    if (!routeTopicId) return undefined
    recordTopicView(routeTopicId, user?.id || null).catch(() => {})
    return undefined
  }, [routeTopicId, user?.id])

  useEffect(() => {
    if (!supabase || !routeTopicId) {
      setTopicViewers([])
      return undefined
    }

    let guestKey
    try {
      guestKey = sessionStorage.getItem('creativezone-viewer-key')
      if (!guestKey) {
        guestKey = globalThis.crypto?.randomUUID?.() || 'guest-' + Date.now().toString(36)
        sessionStorage.setItem('creativezone-viewer-key', guestKey)
      }
    } catch {
      guestKey = 'guest-' + Date.now().toString(36)
    }

    const presenceKey = user?.id && profile?.show_online !== false ? user.id : guestKey
    const channel = supabase.channel('creativezone-topic-presence-' + routeTopicId, {
      config: { presence: { key: presenceKey } },
    })

    const sync = () => {
      const map = new Map()
      Object.values(channel.presenceState() || {}).flat().forEach((viewer) => {
        if (!viewer?.viewer_key) return
        if (!map.has(viewer.viewer_key)) map.set(viewer.viewer_key, viewer)
      })
      setTopicViewers([...map.values()])
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await channel.track({
          viewer_key: presenceKey,
          user_id: user?.id && profile?.show_online !== false ? user.id : null,
          username: profile?.show_online !== false ? (profile?.username || '') : '',
          display_name: profile?.show_online !== false ? (profile?.display_name || profile?.username || 'Visitante') : 'Visitante',
          avatar_url: profile?.show_online !== false ? (profile?.avatar_url || '') : '',
          viewed_at: new Date().toISOString(),
        })
      })

    return () => {
      channel.untrack().catch(() => {})
      supabase.removeChannel(channel)
    }
  }, [routeTopicId, user?.id, profile?.username, profile?.display_name, profile?.avatar_url, profile?.show_online])

  useEffect(() => {
    let cancelled = false

    if (!routeTopicId || !user?.id) {
      setWatchingTopic(false)
      return undefined
    }

    isWatchingTopic(user.id, routeTopicId)
      .then((value) => {
        if (!cancelled) setWatchingTopic(value)
      })
      .catch(() => {
        if (!cancelled) setWatchingTopic(false)
      })

    return () => {
      cancelled = true
    }
  }, [routeTopicId, user?.id])

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([])
      return undefined
    }

    const timer = setTimeout(() => {
      searchForum(query, { limit: 12 })
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
    }, 220)

    return () => clearTimeout(timer)
  }, [query])

  const total = getPageCount(topicCount, 3)
  const currentPage = Math.min(page, total)
  const recent = topics
  const popularTotal = getPageCount(popularTopicCount, 3)
  const currentPopularPage = Math.min(popularPage, popularTotal)
  const displayedPopular = popularTopics
  const visibleActivity = activity.filter((item) => !ignoredIds.includes(item.authorId))
  const categoryTree = useMemo(() => flattenCategoryTree(categories), [categories])
  const routeCategoryPath = useMemo(
    () => getCategoryPath(categories, routeTopic?.categoryId),
    [categories, routeTopic?.categoryId]
  )
  const routeForumNode = useMemo(
    () => routeForumSlug
      ? categories.find((category) => category.slug === routeForumSlug) || null
      : null,
    [categories, routeForumSlug]
  )
  const routeForumPath = useMemo(
    () => getCategoryPath(categories, routeForumNode?.id),
    [categories, routeForumNode?.id]
  )
  const forumCategories = useMemo(
    () => categories
      .filter((category) => category.node_type === 'forum')
      .map((category) => ({
        ...category,
        pathLabel: getCategoryPath(categories, category.id)
          .map((item) => item.name)
          .join(' › '),
      })),
    [categories]
  )

  async function toggleTopicWatch() {
    if (!routeTopicId) return
    if (!user?.id) {
      setToast('Entre para assistir este tópico.')
      navigate('/entrar')
      return
    }

    setWatchBusy(true)
    try {
      if (watchingTopic) {
        await unwatchTopic(user.id, routeTopicId)
        setWatchingTopic(false)
        setToast('Você deixou de assistir este tópico.')
      } else {
        await watchTopic(user.id, routeTopicId)
        setWatchingTopic(true)
        setToast('Agora você receberá notificações sobre novas atividades neste tópico.')
      }
    } catch (error) {
      setToast(error?.message || 'Não foi possível alterar o acompanhamento deste tópico.')
    } finally {
      setWatchBusy(false)
    }
  }

  async function favorite(id) {
    if (!user?.id) {
      setToast('Entre para salvar tópicos.')
      navigate('/entrar')
      return
    }
    try {
      const saved = await toggleBookmark(user.id, id)
      setFavorites((items) =>
        saved ? [...new Set([...items, id])] : items.filter((item) => item !== id)
      )
    } catch (error) {
      setToast(error?.message || 'Não foi possível alterar os favoritos.')
    }
  }

  function reset() {
    setQuery('')
    setFilter('')
    setPage(1)
    setPopularPage(1)
    navigate('/')
  }

  function openTopic(topic) {
    setReply('')
    const id = typeof topic === 'string' ? topic : topic?.id
    if (id) navigate('/topico/' + encodeURIComponent(id))
  }

  function chooseCategory(name) {
    setFilter(name)
    setPage(1)
    setPopularPage(1)
    navigate('/')
  }

  function openCategoryNode(categoryOrName) {
    const category = typeof categoryOrName === 'string'
      ? categories.find((item) => item.name === categoryOrName)
      : categoryOrName

    if (!category?.slug) return
    setFilter('')
    setPage(1)
    setPopularPage(1)
    navigate('/forum/' + encodeURIComponent(category.slug))
  }

  function requireAuth(pathAfterLogin) {
    if (!session?.user) {
      setToast('Entre ou crie uma conta para continuar.')
      navigate('/entrar')
      return false
    }
    navigate(pathAfterLogin)
    return true
  }

  async function publish(topic) {
    if (!session?.user) {
      setToast('Entre ou crie uma conta para publicar.')
      navigate('/entrar')
      throw new Error('Autenticação necessária')
    }

    try {
      const created = await createTopic({
        title: topic.title,
        content: topic.description,
        category_id: topic.categoryId,
        author_id: session.user.id,
        slug: slugify(topic.title) + '-' + Date.now().toString(36),
      })

      if (topic.downloads?.length) {
        try {
          await createTopicDownloads({
            topicId: created.id,
            downloads: topic.downloads,
            userId: session.user.id,
          })
        } catch (downloadError) {
          await deleteTopic(created.id).catch(() => {})
          throw downloadError
        }
      }

      await setTopicTags(created.id, session.user.id, topic.tags || [])

      for (const file of topic.attachments || []) {
        await uploadForumMedia({
          file,
          userId: session.user.id,
          topicId: created.id,
        })
      }

      setFilter('')
      setQuery('')
      setPage(1)
      await refreshForum()
      setToast('Tópico publicado na CreativeZone.')
      navigate('/topico/' + encodeURIComponent(created.id))
    } catch (error) {
      setToast(error?.message || 'Não foi possível publicar o tópico.')
      throw error
    }
  }

  async function submitReply(event) {
    event.preventDefault()
    if (!reply.trim() || !routeTopicId) return

    if (!session?.user) {
      setToast('Entre ou crie uma conta para responder.')
      navigate('/entrar')
      return
    }

    try {
      const createdPost = await createPost({
        topic_id: routeTopicId,
        author_id: session.user.id,
        content: reply.trim(),
      })

      for (const file of replyFiles) {
        await uploadForumMedia({
          file,
          userId: session.user.id,
          postId: createdPost.id,
        })
      }

      setReply('')
      setReplyFiles([])
      const posts = await getPosts(routeTopicId)
      setThreadReplies(posts)
      const mediaPairs = await Promise.all(
        posts.map(async (post) => [post.id, await getPostMedia(post.id).catch(() => [])])
      )
      setPostMedia(Object.fromEntries(mediaPairs))
      await refreshForum()
      setToast('Resposta publicada.')
    } catch (error) {
      setToast(error?.message || 'Não foi possível publicar a resposta.')
    }
  }

  async function chooseAcceptedAnswer(postId) {
    if (!routeTopicId || session?.user?.id !== routeTopic?.authorId) return
    try {
      const nextId = routeTopic.acceptedAnswerId === postId ? null : postId
      await markAcceptedAnswer(routeTopicId, nextId)
      setRouteTopic((current) => current ? { ...current, acceptedAnswerId: nextId } : current)
      setToast(nextId ? 'Resposta marcada como solução. O autor recebeu XP.' : 'Marcação de solução removida.')
    } catch (error) {
      setToast(error?.message || 'Não foi possível alterar a solução do tópico.')
    }
  }

  async function saveTopicEdit(event) {
    event.preventDefault()
    if (!routeTopicId) return
    try {
      const updated = await updateTopic(routeTopicId, {
        title: editingTopicDraft.title.trim(),
        content: editingTopicDraft.content.trim(),
        category_id: editingTopicDraft.categoryId,
      })
      const names = String(editingTopicDraft.tags || '').split(',').map((value) => value.replace(/^#+/, '').trim()).filter(Boolean).slice(0,6)
      const nextTags = await setTopicTags(routeTopicId, session.user.id, names)
      setRouteTags(nextTags)
      setRouteTopic(mapTopic(updated))
      setEditingTopic(false)
      await refreshForum()
      setToast('Tópico atualizado.')
    } catch (error) {
      setToast(error?.message || 'Não foi possível editar o tópico.')
    }
  }

  async function removeTopic() {
    if (!routeTopicId || !window.confirm('Excluir este tópico permanentemente?')) return
    try {
      await deleteTopic(routeTopicId)
      setToast('Tópico excluído.')
      await refreshForum()
      navigate('/')
    } catch (error) {
      setToast(error?.message || 'Não foi possível excluir o tópico.')
    }
  }

  async function savePostEdit(postId) {
    try {
      const updated = await updatePost(postId, editingPostText.trim())
      setThreadReplies((items) => items.map((item) => item.id === postId ? updated : item))
      setEditingPostId(null)
      setEditingPostText('')
      setToast('Resposta atualizada.')
    } catch (error) {
      setToast(error?.message || 'Não foi possível editar a resposta.')
    }
  }

  async function removePost(postId) {
    if (!window.confirm('Excluir esta resposta permanentemente?')) return
    try {
      await deletePost(postId)
      setThreadReplies((items) => items.filter((item) => item.id !== postId))
      setToast('Resposta excluída.')
      await refreshForum()
    } catch (error) {
      setToast(error?.message || 'Não foi possível excluir a resposta.')
    }
  }

  function quoteToReply(username, content) {
    if (!session?.user) {
      setToast('Entre para citar e responder.')
      navigate('/entrar')
      return
    }
    if (!username) return

    const quoted = String(content || '').slice(0, 1800)
    const block = `[quote=@${username}]${quoted}[/quote]\n\n`
    setReply((current) => current ? current + '\n' + block : block)
    queueMicrotask(() => {
      const field = document.getElementById('reply')
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      field?.focus()
    })
  }

  async function leaveAccount() {
    try {
      await signOut()
      setProfile(null)
      setToast('Você saiu da sua conta.')
      navigate('/')
    } catch (error) {
      setToast(error?.message || 'Não foi possível sair.')
    }
  }

  const profileName =
    profile?.display_name || profile?.username || user?.email?.split('@')[0] || 'Meu perfil'
  const profileImage = profile?.avatar_url || A.fbm

  const topicProps = {
    onOpen: openTopic,
    onFavorite: favorite,
    favorites,
    onMenu: openTopic,
  }

  const isHome = path === '/'
  const isLogin = path === '/entrar'
  const isSignup = path === '/cadastro'
  const isForgotPassword = path === '/esqueci-senha'
  const isResetPassword = path === '/redefinir-senha'
  const isComposer = path === '/novo-topico'
  const isSearch = path === '/buscar'
  const isMembers = path === '/membros'
  const isNotifications = path === '/notificacoes'
  const isCategories = path === '/categorias' || path === '/temas'
  const isProfile = path === '/perfil'
  const isAbout = path === '/creativezone'
  const isProjects = path === '/projetos' || Boolean(routeProjectSlug)
  const isModeration = path === '/moderacao'
  const isAccount = Boolean(accountMatch)
  const isMessages = Boolean(messagesMatch)
  const isRanking = path === '/ranking'
  const isAchievements = path === '/conquistas'

  function renderHome() {
    const showingTopicSearch = Boolean(query || filter)

    return (
      <>
        <CommunityChat
          session={session}
          profile={profile}
          onlineMembers={forumOnlineMembers}
          ignoredIds={ignoredIds}
          navigate={navigate}
          notify={setToast}
        />

        <main>
          <div className="maincolumn">
            {showingTopicSearch ? (
              <>
                <section>
                  <h1>{query ? 'Resultados da busca' : filter}</h1>
                  <button
                    className="clear-filter"
                    onClick={() => {
                      setQuery('')
                      setFilter('')
                    }}
                  >
                    Limpar filtros ×
                  </button>

                  <div className="topiclist">
                    {forumLoading ? (
                      <p className="empty">Carregando tópicos...</p>
                    ) : (
                      recent.map((topic) => <Topic topic={topic} key={topic.id} {...topicProps} />)
                    )}

                    {!forumLoading && !recent.length && (
                      <p className="empty">Nenhum tópico encontrado.</p>
                    )}
                  </div>

                  <Pagination page={currentPage} setPage={setPage} total={total} />
                </section>

                <section className="popular">
                  <h2>Mais visualizados nesta busca</h2>
                  <div className="desktop-topics">
                    {displayedPopular.map((topic) => (
                      <Topic topic={topic} key={topic.id} {...topicProps} />
                    ))}
                  </div>
                  <div className="mobile-topics">
                    {displayedPopular.map((topic) => (
                      <Topic topic={topic} key={topic.id} {...topicProps} />
                    ))}
                  </div>
                  <Pagination
                    page={currentPopularPage}
                    setPage={setPopularPage}
                    total={popularTotal}
                  />
                </section>
              </>
            ) : (
              <>
                <PersonalizedFeed session={session} navigate={navigate} />
                <ForumIndex
                categories={categories}
                navigate={navigate}
                notify={setToast}
                onOpenTopic={openTopic}
              />
              </>
            )}
          </div>

          <aside>
            <section className="activity">
              <h2>Últimas publicações</h2>
              {activity.length ? (
                visibleActivity.map((item) => (
                  <button
                    className="activityitem"
                    key={item.id}
                    onClick={() => openTopic(item.topicId)}
                  >
                    <Avatar src={item.avatarUrl} small />
                    <span>
                      <strong>{item.user}</strong> &gt; <strong>{item.topicTitle}</strong>
                      <br />
                      “{item.text.slice(0, 62)}{item.text.length > 62 ? '...' : ''}”
                    </span>
                  </button>
                ))
              ) : (
                <p className="side-empty">As respostas da comunidade aparecerão aqui.</p>
              )}
            </section>

            <section className="themes">
              <h2>
                Categorias
                <button aria-label="Gerenciar categorias" onClick={() => navigate('/categorias')}>
                  <Icon name="plus" />
                </button>
              </h2>
              {categoryTree.map((category) => (
                <button
                  key={category.id}
                  className={'category-side-node category-side-' + category.node_type}
                  style={{ '--category-depth': category.depth }}
                  onClick={() => openCategoryNode(category)}
                >
                  <span>{category.name}</span>
                  <small>
                    {category.node_type === 'category'
                      ? 'Categoria'
                      : category.node_type === 'section'
                        ? 'Subcategoria'
                        : 'Fórum'}
                  </small>
                </button>
              ))}
              <CategorySuggestionButton
                session={session}
                navigate={navigate}
                notify={setToast}
                className="category-suggest-side"
                label="Sugerir categoria"
              />
            </section>
          </aside>
        </main>

        <footer />
      </>
    )
  }

  function renderRoutePage() {
    if (path === '/admin') {
      return (
        <AdminDashboard
          session={session}
          profile={profile}
          navigate={navigate}
          notify={setToast}
        />
      )
    }
    if (path === '/elite') return <EliteAreaPage session={session} navigate={navigate} />
    if (isRanking) return <RankingsPage navigate={navigate} />
    if (isAchievements) return <AchievementsPage session={session} navigate={navigate} />
    if (routeTagSlug) return <TagPage slug={routeTagSlug} session={session} navigate={navigate} />

    if (isForgotPassword) {
      return <PasswordRecoveryPage mode="request" session={session} navigate={navigate} notify={setToast} />
    }

    if (isResetPassword) {
      return <PasswordRecoveryPage mode="reset" session={session} navigate={navigate} notify={setToast} />
    }

    if (routeForumSlug) {
      if (!routeForumNode && forumLoading) {
        return (
          <PageShell title="Carregando área..." onBack={() => navigate('/')} wide>
            <div className="panel-content"><p>Carregando estrutura do fórum...</p></div>
          </PageShell>
        )
      }

      return (
        <ForumNodePage
          node={routeForumNode}
          categories={categories}
          session={session}
          profile={profile}
          navigate={navigate}
          notify={setToast}
          onOpenTopic={openTopic}
          onChanged={refreshForum}
          ignoredIds={ignoredIds}
        />
      )
    }

    if (routeProjectSlug) {
      return <ProjectPage slug={routeProjectSlug} session={session} navigate={navigate} notify={setToast} />
    }

    if (path === '/projetos') {
      return <ProjectsPage session={session} navigate={navigate} notify={setToast} />
    }

    if (isModeration) {
      return <ModerationPage profile={profile} session={session} navigate={navigate} notify={setToast} />
    }

    if (routeMemberUsername) {
      return (
        <PublicProfilePage
          username={routeMemberUsername}
          session={session}
          navigate={navigate}
          notify={setToast}
        />
      )
    }

    if (isAccount || isProfile) {
      return (
        <AccountPage
          section={isProfile ? 'perfil' : accountSection}
          session={session}
          profile={profile}
          setProfile={setProfile}
          navigate={navigate}
          notify={setToast}
          appearance={appearance}
          setAppearance={setAppearance}
        />
      )
    }

    if (isMessages) {
      return (
        <MessagesPage
          username={messageUsername}
          session={session}
          members={members}
          navigate={navigate}
          notify={setToast}
        />
      )
    }

    if (isLogin) {
      if (session) {
        return (
          <PageShell title="Você já está conectado" onBack={() => navigate('/')}>
            <div className="panel-content">
              <p>Você já entrou como <strong>{profileName}</strong>.</p>
              <div className="route-actions">
                <button className="action" onClick={() => navigate('/perfil')}>Abrir meu perfil</button>
                <button className="action" onClick={leaveAccount}><LogOut /> Sair</button>
              </div>
            </div>
          </PageShell>
        )
      }
      return <AuthPage mode="login" navigate={navigate} notify={setToast} />
    }

    if (isSignup) {
      if (session) {
        return (
          <PageShell title="Conta já conectada" onBack={() => navigate('/')}>
            <div className="panel-content">
              <p>Você já está conectado. Para criar outra conta, saia primeiro.</p>
            </div>
          </PageShell>
        )
      }
      return <AuthPage mode="signup" navigate={navigate} notify={setToast} />
    }

    if (isComposer) {
      if (!session) {
        return (
          <PageShell title="Entre para publicar" onBack={() => navigate('/')}>
            <div className="panel-content guest-page">
              <p>Você precisa estar conectado para criar um tópico.</p>
              <div className="route-actions">
                <button className="action" onClick={() => navigate('/entrar')}><LogIn /> Entrar</button>
                <button className="action primary-action" onClick={() => navigate('/cadastro')}><UserPlus /> Criar conta</button>
              </div>
            </div>
          </PageShell>
        )
      }
      return (
        <ComposerPage
          onPublish={publish}
          notify={setToast}
          categories={forumCategories}
          navigate={navigate}
          session={session}
          profile={profile}
          membershipState={membershipState}
        />
      )
    }

    if (isSearch) {
      return <AdvancedSearchPage categories={forumCategories} navigate={navigate} initialQuery={query} />
    }

    if (isMembers) {
      return (
        <PageShell title="Membros" onBack={() => navigate('/')} wide>
          <div className="panel-content members standalone-members">
            {members.map((member) => {
              const decoration = memberDecorations[member.id]
              const cosmetics = decoration?.cosmetics || {}
              const membership = decoration?.membership || null

              return (
                <button
                  className="member-row"
                  key={member.id}
                  onClick={() => navigate('/membro/' + encodeURIComponent(member.username))}
                >
                  <Avatar src={member.avatar_url} />
                  <span>
                    <EffectName
                      as="strong"
                      text={member.display_name || member.username || 'Membro'}
                      effect={cosmetics.name_effect || 'clean'}
                      color={cosmetics.name_color || null}
                      className="member-list-effect-name"
                    />
                    <small>
                      <EffectRole
                        effect={cosmetics.role_effect || 'clean-role'}
                        className="member-list-role"
                      >
                        {member.role === 'member' ? 'Membro' : member.role}
                      </EffectRole>
                      {member.occupation ? ' · ' + member.occupation : ''}
                    </small>
                    {membership?.plan_id && membership.plan_id !== 'free' && (
                      <EffectBadge
                        effect={cosmetics.badge_effect || 'clean-badge'}
                        className={'member-list-vip membership-' + membership.plan_id}
                      >
                        {membership.badge}{membership.permanent ? ' ∞' : ''}
                      </EffectBadge>
                    )}
                  </span>
                </button>
              )
            })}
            {!members.length && <p>Ainda não há membros cadastrados.</p>}
          </div>
        </PageShell>
      )
    }

    if (isNotifications) {
      return (
        <PageShell title="Últimas publicações" onBack={() => navigate('/')} wide>
          <div className="panel-content notification-list standalone-notifications">
            {visibleActivity.map((item) => {
              const topic = topics.find((candidate) => candidate.id === item.topicId)
              return (
                <button
                  key={item.id}
                  onClick={() => openTopic(item.topicId)}
                >
                  <Avatar src={item.avatarUrl} small />
                  <span>
                    <strong>{item.user} &gt; {item.topicTitle}</strong>
                    <br />
                    {item.text}
                  </span>
                </button>
              )
            })}
            {!visibleActivity.length && <p>Ainda não há publicações recentes.</p>}
          </div>
        </PageShell>
      )
    }

    if (isCategories) {
      return (
        <CategoriesPage
          categories={categories}
          session={session}
          profile={profile}
          navigate={navigate}
          notify={setToast}
          onChoose={openCategoryNode}
          onChanged={refreshForum}
        />
      )
    }

    if (isProfile) {
      return (
        <PageShell title="Meu perfil" onBack={() => navigate('/')}>
          <div className="panel-content profile-page">
            <Avatar src={profileImage} />
            <div>
              <strong>{profileName}</strong>
              <small>{user?.email}</small>
            </div>
            <p>{favorites.length} tópico(s) salvo(s)</p>
            <div className="route-actions">
              <button className="action" onClick={() => requireAuth('/novo-topico')}>Criar tópico</button>
              <button className="action" onClick={leaveAccount}><LogOut /> Sair</button>
            </div>
          </div>
        </PageShell>
      )
    }

    if (isAbout) {
      return (
        <PageShell title="CreativeZone" onBack={() => navigate('/')} full>
          <div className="panel-content about-page">
            <section className="about-intro">
              <span className="about-kicker">COMUNIDADE • IDEIAS • PROJETOS</span>
              <h2>Um espaço para conversar, aprender e construir juntos.</h2>
              <p>
                A <strong>CreativeZone</strong> é uma comunidade criada para reunir pessoas curiosas,
                criativas e apaixonadas por tecnologia. Aqui falamos sobre desenvolvimento de
                software, automação, inteligência artificial, infraestrutura, hardware, games,
                negócios digitais e tudo aquilo que nasce quando conhecimento e criatividade se
                encontram.
              </p>
              <p>
                Mais do que um fórum para tirar dúvidas, queremos que a CreativeZone seja um lugar
                onde ideias possam evoluir. Uma conversa pode virar um experimento, um tópico pode
                se transformar em uma ferramenta útil e membros que nunca trabalharam juntos podem
                acabar criando algo incrível em equipe.
              </p>
            </section>

            <section className="about-highlight">
              <h3>Na CreativeZone, todo membro pode criar.</h3>
              <p>
                Todos os membros são bem-vindos para propor novos projetos, participar de projetos
                existentes, formar equipes, compartilhar conhecimento e contribuir da maneira que
                fizer mais sentido. Você pode ajudar com código, documentação, design, testes,
                pesquisa, ideias, organização ou simplesmente com uma boa discussão que ajude o
                projeto a evoluir.
              </p>
            </section>

            <div className="about-project-grid">
              <article>
                <strong>Crie seu projeto</strong>
                <p>
                  Tem uma ideia? Apresente-a à comunidade, encontre pessoas interessadas e comece a
                  transformar o conceito em algo real.
                </p>
              </article>
              <article>
                <strong>Participe e colabore</strong>
                <p>
                  Entre em projetos de outros membros, contribua com o que você sabe e aproveite a
                  oportunidade para aprender com pessoas de diferentes áreas.
                </p>
              </article>
              <article>
                <strong>Aprenda construindo</strong>
                <p>
                  Você não precisa ser especialista. Projetos comunitários também são espaços para
                  experimentar, errar, receber feedback e desenvolver novas habilidades.
                </p>
              </article>
            </div>

            <section className="about-github-card">
              <div>
                <span className="about-kicker">CREATIVEZONE NO GITHUB</span>
                <h3>Nossa comunidade também constrói em código aberto.</h3>
                <p>
                  A organização <strong>Creatiive-Lab</strong> no GitHub é o espaço onde projetos da
                  comunidade podem ganhar vida, receber contribuições e evoluir de forma
                  colaborativa. Se você faz parte da CreativeZone, considere este espaço seu também:
                  explore os projetos, participe das discussões e ajude a construir o próximo.
                </p>
              </div>
              <a
                className="github-community-link"
                href="https://github.com/Creatiive-Lab"
                target="_blank"
                rel="noreferrer noopener"
              >
                <img src={githubIcon} alt="" aria-hidden="true" />
                Visitar a comunidade no GitHub
              </a>
            </section>

            <p className="about-closing">
              <strong>CreativeZone é feita por quem participa.</strong> Compartilhe o que você sabe,
              pergunte o que ainda não sabe e, quando surgir uma boa ideia, convide a comunidade
              para construir com você.
            </p>
          </div>
        </PageShell>
      )
    }

    if (routeTopicId) {
      if (!routeTopic) {
        return (
          <PageShell title="Carregando tópico..." onBack={() => navigate('/')} wide>
            <div className="panel-content"><p>Carregando ou tópico não encontrado...</p></div>
          </PageShell>
        )
      }

      const ownsTopic = session?.user?.id === routeTopic.authorId

      return (
        <PageShell title={routeTopic.title} onBack={() => navigate('/')} wide>
          <div className="thread-watchbar">
            <div>
              <strong>{routeTopic.category}</strong>
              <span>
                {routeTopic.locked
                  ? 'Tópico fechado para novas respostas'
                  : 'Acompanhe a discussão e receba as próximas atualizações.'}
              </span>
            </div>
            <div className="thread-live-context">
              <span><Users /> {topicViewers.length} visualizando agora</span>
              {routeTags.length > 0 && (
                <div className="thread-tag-list">
                  {routeTags.map((tag) => (
                    <button key={tag.id} onClick={() => navigate('/tag/' + encodeURIComponent(tag.slug))}>#{tag.name}</button>
                  ))}
                </div>
              )}
            </div>
            <button
              className={'action thread-watch-button ' + (watchingTopic ? 'watching' : '')}
              onClick={toggleTopicWatch}
              disabled={watchBusy}
            >
              {watchingTopic ? <BellOff /> : <Bell />}
              {watchBusy ? 'Aguarde...' : watchingTopic ? 'Deixar de assistir' : 'Assistir tópico'}
            </button>
          </div>

          <div className="thread-board">
            <ThreadPostCard
              profile={routeTopic.profile}
              stats={threadAuthorStats[routeTopic.authorId]}
              navigate={navigate}
              fallbackName={routeTopic.user}
              fallbackAvatar={routeTopic.avatarUrl}
              decoration={threadDecorations[routeTopic.authorId]}
              createdAt={routeTopic.createdAt}
              number={1}
              original
              signature={routeTopic.signature}
              actions={
                <>
                  <ReactionButton session={session} topicId={routeTopic.id} notify={setToast} />
                  {routeTopic.authorUsername && (
                    <button className="action quote-action" onClick={() => quoteToReply(routeTopic.authorUsername, routeTopic.description)}>
                      <Quote /> Citar
                    </button>
                  )}
                  {session && (
                    <ReportButton
                      session={session}
                      targetType="topic"
                      targetId={routeTopic.id}
                      notify={setToast}
                    />
                  )}
                  {ownsTopic && !editingTopic && (
                    <button
                      className="action"
                      onClick={() => {
                        setEditingTopicDraft({
                          title: routeTopic.title,
                          content: routeTopic.description,
                          categoryId: routeTopic.categoryId,
                          tags: routeTags.map((tag) => tag.name).join(', '),
                        })
                        setEditingTopic(true)
                      }}
                    >
                      <Edit3 /> Editar
                    </button>
                  )}
                  {ownsTopic && (
                    <button className="action danger-action" onClick={removeTopic}>
                      <Trash2 /> Excluir
                    </button>
                  )}
                </>
              }
            >
              {editingTopic ? (
                <form className="inline-edit-form" onSubmit={saveTopicEdit}>
                  <label>
                    Título
                    <input
                      required
                      maxLength={160}
                      value={editingTopicDraft.title}
                      onChange={(event) => setEditingTopicDraft((draft) => ({
                        ...draft,
                        title: event.target.value,
                      }))}
                    />
                  </label>
                  <label>
                    Fórum
                    <select
                      value={editingTopicDraft.categoryId}
                      onChange={(event) => setEditingTopicDraft((draft) => ({
                        ...draft,
                        categoryId: event.target.value,
                      }))}
                    >
                      {forumCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.pathLabel || category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tags
                    <input
                      value={editingTopicDraft.tags || ''}
                      onChange={(event) => setEditingTopicDraft((draft) => ({ ...draft, tags: event.target.value }))}
                      placeholder="#React, #IA, #Cloud"
                    />
                  </label>
                  <label>
                    Conteúdo
                    <ProfessionalEditor
                      value={editingTopicDraft.content}
                      onChange={(value) => setEditingTopicDraft((draft) => ({ ...draft, content: value }))}
                      required
                      maxLength={12000}
                    />
                  </label>
                  <div className="route-actions">
                    <button className="action primary-action" type="submit"><Save /> Salvar</button>
                    <button className="action" type="button" onClick={() => setEditingTopic(false)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <ForumText content={routeTopic.description} />
              )}
              <ForumMediaList items={topicMedia} />
              <ProtectedDownloads
                items={topicDownloads}
                session={session}
                profile={profile}
                membershipState={membershipState}
                navigate={navigate}
                notify={setToast}
                onRefresh={refreshTopicDownloads}
              />
            </ThreadPostCard>

            {threadReplies.map((post, index) => {
              const ownsPost = session?.user?.id === post.author_id
              return (
                <ThreadPostCard
                  key={post.id}
                  profile={post.profiles}
                  stats={threadAuthorStats[post.author_id]}
                  navigate={navigate}
                  fallbackName={post.profiles?.display_name || post.profiles?.username || 'Membro'}
                  fallbackAvatar={post.profiles?.avatar_url || ''}
                  decoration={threadDecorations[post.author_id]}
                  createdAt={post.created_at}
                  number={index + 2}
                  signature={post.profiles?.signature}
                  actions={
                    <>
                      <ReactionButton session={session} postId={post.id} notify={setToast} />
                      {ownsTopic && post.author_id !== routeTopic.authorId && (
                        <button
                          className={'action solution-action ' + (routeTopic.acceptedAnswerId === post.id ? 'active' : '')}
                          onClick={() => chooseAcceptedAnswer(post.id)}
                        >
                          <CheckCircle2 /> {routeTopic.acceptedAnswerId === post.id ? 'Solução aceita' : 'Marcar solução'}
                        </button>
                      )}
                      {post.profiles?.username && (
                        <button className="action quote-action" onClick={() => quoteToReply(post.profiles.username, post.content)}>
                          <Quote /> Citar
                        </button>
                      )}
                      {session && (
                        <ReportButton
                          session={session}
                          targetType="post"
                          targetId={post.id}
                          notify={setToast}
                        />
                      )}
                      {ownsPost && editingPostId !== post.id && (
                        <button
                          className="action"
                          onClick={() => {
                            setEditingPostId(post.id)
                            setEditingPostText(post.content)
                          }}
                        >
                          <Edit3 /> Editar
                        </button>
                      )}
                      {ownsPost && (
                        <button className="action danger-action" onClick={() => removePost(post.id)}>
                          <Trash2 /> Excluir
                        </button>
                      )}
                    </>
                  }
                >
                  {routeTopic.acceptedAnswerId === post.id && (
                    <div className="accepted-answer-banner"><CheckCircle2 /> Solução aceita pelo autor do tópico</div>
                  )}
                  {editingPostId === post.id ? (
                    <div className="inline-post-edit">
                      <ProfessionalEditor
                        value={editingPostText}
                        onChange={setEditingPostText}
                        maxLength={12000}
                      />
                      <div className="route-actions">
                        <button className="action primary-action" onClick={() => savePostEdit(post.id)}>
                          <Save /> Salvar
                        </button>
                        <button
                          className="action"
                          onClick={() => {
                            setEditingPostId(null)
                            setEditingPostText('')
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ForumText content={post.content} />
                  )}
                  <ForumMediaList items={postMedia[post.id] || []} />
                </ThreadPostCard>
              )
            })}

            {!threadReplies.length && (
              <p className="thread-empty thread-empty-board">
                Ainda não há respostas neste tópico.
              </p>
            )}
          </div>

          {relatedTopics.length > 0 && (
            <section className="related-topics">
              <h2>Tópicos relacionados</h2>
              <div>
                {relatedTopics.map((item) => (
                  <button key={item.id} onClick={() => navigate('/topico/' + item.id)}>
                    <strong>{item.title}</strong>
                    <span>{item.category_name} · {item.shared_tags} tag(s) em comum · {item.reply_count} respostas</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="thread-reply-area">
            {routeTopic.locked ? (
              <p className="thread-empty">Este tópico está bloqueado para novas respostas.</p>
            ) : session ? (
              <form onSubmit={submitReply} className="reply-form">
                <label htmlFor="reply">Responder ao tópico</label>
                <ProfessionalEditor
                  id="reply"
                  value={reply}
                  onChange={setReply}
                  files={replyFiles}
                  onFilesChange={setReplyFiles}
                  maxFiles={membershipState?.entitlements?.forum_upload_count || 4}
                  maxBytes={(membershipState?.entitlements?.forum_upload_mb || 10) * 1024 * 1024}
                  required
                  maxLength={12000}
                  placeholder="Escreva sua resposta. Markdown, embeds e arrastar arquivos são suportados."
                />
                <button className="action primary-action" type="submit"><Send /> Enviar resposta</button>
              </form>
            ) : (
              <div className="reply-login-box">
                <p>Entre para responder ou assistir a este tópico.</p>
                <div className="route-actions">
                  <button className="action" onClick={() => navigate('/entrar')}><LogIn /> Entrar</button>
                  <button className="action primary-action" onClick={() => navigate('/cadastro')}>
                    <UserPlus /> Criar conta
                  </button>
                </div>
              </div>
            )}
          </div>
        </PageShell>
      )
    }

    return (
      <PageShell title="Página não encontrada" onBack={() => navigate('/')}>
        <div className="panel-content"><p>A página solicitada não existe.</p></div>
      </PageShell>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <nav className="leftnav" aria-label="Principal">
          <button
            className={'forum-home-link ' + (isHome ? 'active' : '')}
            onClick={reset}
            aria-label="CreativeZone — Fórum"
          >
            <img
              src={logo}
              alt=""
              width="30"
              height="30"
              style={{
                display: 'block',
                width: '30px',
                height: '30px',
                maxWidth: '30px',
                maxHeight: '30px',
                minWidth: '30px',
                minHeight: '30px',
                objectFit: 'contain',
                flex: '0 0 30px',
              }}
            />
            <span>Fórum</span>
          </button>
          <button className={isMembers ? 'active' : ''} onClick={() => navigate('/membros')}>
            <Icon name="members" />
            Membros
          </button>
          <button className={isAbout ? 'active' : ''} onClick={() => navigate('/creativezone')}>
            <Icon name="portal" />
            CreativeZone
          </button>
          <button className={isProjects ? 'active' : ''} onClick={() => navigate('/projetos')}>
            <Briefcase />
            Projetos
          </button>
        </nav>

        <nav className="rightnav" aria-label="Ações">
          <button className="newtopic" onClick={() => requireAuth('/novo-topico')}>
            <Icon name="pencil" />
            Novo Tópico
          </button>

          <button
            className="search-trigger"
            aria-expanded={overlay === 'search'}
            onClick={() => {
              setUserMenuOpen(false)
              setOverlay((current) => current === 'search' ? null : 'search')
            }}
          >
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
            aria-expanded={overlay === 'notifications'}
            onClick={() => {
              setUserMenuOpen(false)
              setOverlay((current) => current === 'notifications' ? null : 'notifications')
            }}
          >
            <Icon name="bell" />
          </button>

          {!authLoading && session ? (
            <button
              className="profile"
              aria-label={profileName}
              aria-expanded={userMenuOpen}
              onClick={() => {
                setOverlay(null)
                setUserMenuOpen((value) => !value)
              }}
            >
              <img src={profileImage} alt="" />
              <ChevronDown />
            </button>
          ) : !authLoading ? (
            <div className="guest-auth">
              <button onClick={() => navigate('/entrar')}><LogIn /> Entrar</button>
              <button className="signup-link" onClick={() => navigate('/cadastro')}><UserPlus /> Criar conta</button>
            </div>
          ) : null}
        </nav>
      </header>

      {userMenuOpen && session && profile && (
        <UserQuickMenu
          profile={profile}
          session={session}
          onClose={() => setUserMenuOpen(false)}
          navigate={navigate}
          onSignOut={leaveAccount}
        />
      )}

      {isHome && (
        <button className="forum-banner" onClick={reset} aria-label="CreativeZone — início">
          <img
            src={appearance === 'light' ? bannerLight : banner}
            alt={appearance === 'light' ? 'CreativeZone — tema claro' : 'CreativeZone — tema escuro'}
          />
        </button>
      )}

      {isHome && (
        <div className="mobile-themes">
          <div ref={mobileThemes}>
            {categoryTree.map((category) => (
              <button
                key={category.id}
                className={'mobile-category-' + category.node_type}
                onClick={() => openCategoryNode(category)}
              >
                {category.name}
              </button>
            ))}
          </div>
          <button
            aria-label="Ver mais categorias"
            onClick={() => mobileThemes.current?.scrollBy({ left: 180, behavior: 'smooth' })}
          >
            <ChevronRight />
          </button>
        </div>
      )}

      <div className="crumb">
        <button onClick={reset}>Fórum</button>
        {routeTopicId && routeTopic ? (
          <>
            {routeCategoryPath.map((category) => (
              <React.Fragment key={category.id}>
                <ChevronRight />
                <button onClick={() => openCategoryNode(category)}>
                  {category.name}
                </button>
              </React.Fragment>
            ))}
            <ChevronRight />
            <span>{routeTopic.title}</span>
          </>
        ) : routeForumNode ? (
          <>
            {routeForumPath.map((category, index) => (
              <React.Fragment key={category.id}>
                <ChevronRight />
                {index === routeForumPath.length - 1 ? (
                  <span>{category.name}</span>
                ) : (
                  <button onClick={() => openCategoryNode(category)}>
                    {category.name}
                  </button>
                )}
              </React.Fragment>
            ))}
          </>
        ) : (
          <>
            <ChevronRight />
            <span>
              {isHome
                ? filter || 'Inicial'
                : path === '/categorias' || path === '/temas'
                  ? 'Categorias'
                  : path.replace(/^\//, '').replace(/-/g, ' ') || 'Inicial'}
            </span>
          </>
        )}
      </div>

      {!hasSupabaseConfig && (
        <div className="backend-warning" role="alert">
          O build não recebeu as variáveis do Supabase.
        </div>
      )}

      {forumError && (
        <div className="backend-warning" role="alert">
          {forumError}
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {isHome ? renderHome() : renderRoutePage()}

      <nav className="bottomnav" aria-label="Navegação mobile">
        <button aria-label="Início" onClick={reset}>
          <Icon name="home" />
        </button>
        <button aria-label="Buscar" onClick={() => setOverlay('search')}>
          <Icon name="mobilesearch" />
        </button>
        <button
          className="add-topic"
          aria-label="Novo tópico"
          onClick={() => requireAuth('/novo-topico')}
        >
          <Icon name="add" />
        </button>
        <button aria-label="Membros" onClick={() => navigate('/membros')}>
          <Icon name="mobilemembers" />
        </button>
        <button
          aria-label="Últimas publicações"
          onClick={() => setOverlay('notifications')}
        >
          <Icon name="feed" />
        </button>
      </nav>

      {overlay === 'search' && (
        <OverlayPanel
          title="Buscar no fórum"
          onClose={() => setOverlay(null)}
          variant="search"
        >
          <form
            className="panel-content overlay-search-form"
            onSubmit={(event) => {
              event.preventDefault()
              setPage(1)
              setPopularPage(1)
              setOverlay(null)
              navigate('/')
            }}
          >
            <label htmlFor="overlay-search-field">Palavra-chave ou membro</label>
            <input
              id="overlay-search-field"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              placeholder="O que você procura?"
            />
            <div className="overlay-search-actions">
              <button className="action primary-action" type="submit">
                <Icon name="search" />
                Buscar rápido
              </button>
              <button className="action" type="button" onClick={() => { setOverlay(null); navigate('/buscar') }}>
                Busca avançada
              </button>
            </div>
          </form>
        </OverlayPanel>
      )}

      {overlay === 'notifications' && (
        <OverlayPanel
          title={session ? 'Notificações' : 'Últimas publicações'}
          onClose={() => setOverlay(null)}
          wide
          variant="notifications"
        >
          {session ? (
            <NotificationsPanel
              session={session}
              navigate={navigate}
              onClose={() => setOverlay(null)}
            />
          ) : (
            <div className="panel-content notification-list overlay-notifications">
              {visibleActivity.map((item) => {
                const topic = topics.find((candidate) => candidate.id === item.topicId)
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setOverlay(null)
                      openTopic(item.topicId)
                    }}
                  >
                    <Avatar src={item.avatarUrl} small />
                    <span>
                      <strong>{item.user} &gt; {item.topicTitle}</strong>
                      <br />
                      {item.text}
                    </span>
                  </button>
                )
              })}
              {!visibleActivity.length && <p>Ainda não há publicações recentes.</p>}
            </div>
          )}
        </OverlayPanel>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
