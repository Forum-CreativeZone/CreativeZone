import React, { useEffect, useMemo, useState } from 'react'
import {
  AtSign,
  BadgeCheck,
  Bell,
  Bookmark,
  Briefcase,
  Calendar,
  ChevronLeft,
  FileText,
  Heart,
  Link2,
  MapPin,
  MessageCircle,
  Palette,
  Save,
  Send,
  Settings,
  Shield,
  Trophy,
  Upload,
  User,
  UserMinus,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react'
import {
  getAccountSettings,
  getBookmarks,
  getConversation,
  getFollowState,
  getFollowers,
  getFollowing,
  getIgnored,
  getInbox,
  getMyContent,
  getNotifications,
  getPublicProfile,
  getReactionCount,
  getReactionState,
  getReceivedReactions,
  linkIdentity,
  markAllNotificationsRead,
  markNotificationRead,
  saveAccountProfile,
  searchDirectMessages,
  sendDirectMessage,
  toggleFollow,
  toggleIgnore,
  toggleReaction,
  uploadAvatar,
  uploadProfileCover,
} from './services/communityApi'
import {
  getEligibleFeaturedProjects,
  getFeaturedProjects,
  reputationLevel,
  saveFeaturedProjects,
} from './services/communityFeaturesApi'
import { supabase } from './services/supabaseClient'
import {
  AccountUpdatesSection,
  AppearanceSection,
  NotificationPreferencesSection,
  SecuritySection,
} from './AdvancedAccountSections'
import { ReportButton } from './ExtendedCommunityPages'

function Avatar({ profile, size = 56 }) {
  const name = profile?.display_name || profile?.username || 'Membro'
  return profile?.avatar_url ? (
    <img
      className="community-avatar"
      src={profile.avatar_url}
      alt={name}
      style={{ width: size, height: size }}
    />
  ) : (
    <span className="community-avatar community-avatar-fallback" style={{ width: size, height: size }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value))
}

function formatRelative(value) {
  if (!value) return '—'
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diff / 60000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  return `há ${days} dia${days === 1 ? '' : 's'}`
}

function CommunityShell({ title, onBack, children, wide = true }) {
  return (
    <section className={'community-page ' + (wide ? 'community-page-wide' : '')}>
      <div className="community-page-card">
        <header className="community-page-head">
          <button onClick={onBack}><ChevronLeft /> Voltar</button>
          <h1>{title}</h1>
        </header>
        {children}
      </div>
    </section>
  )
}

export function ReactionButton({ session, topicId, postId, notify }) {
  const userId = session?.user?.id
  const [active, setActive] = useState(false)
  const [count, setCount] = useState(0)

  async function refresh() {
    try {
      const [nextCount, nextActive] = await Promise.all([
        getReactionCount({ topicId, postId }),
        userId ? getReactionState(userId, { topicId, postId }) : Promise.resolve(false),
      ])
      setCount(nextCount)
      setActive(nextActive)
    } catch {}
  }

  useEffect(() => {
    refresh()
  }, [topicId, postId, userId])

  async function toggle() {
    if (!userId) {
      notify?.('Entre para reagir às publicações.')
      return
    }
    try {
      const next = await toggleReaction(userId, { topicId, postId })
      setActive(next)
      setCount((value) => Math.max(0, value + (next ? 1 : -1)))
    } catch (error) {
      notify?.(error?.message || 'Não foi possível registrar a reação.')
    }
  }

  return (
    <button className={'reaction-button ' + (active ? 'active' : '')} onClick={toggle}>
      <Heart /> {count}
    </button>
  )
}

export function UserQuickMenu({ profile, session, onClose, navigate, onSignOut }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    if (!profile?.username) return
    getPublicProfile(profile.username).then(setSummary).catch(() => {})
  }, [profile?.username])

  return (
    <>
      <button className="user-menu-dismiss" aria-label="Fechar menu" onClick={onClose} />
      <aside className="user-quick-menu">
        <div className="user-quick-profile">
          <Avatar profile={profile} size={64} />
          <div>
            <strong>{profile?.display_name || profile?.username || 'Membro'}</strong>
            <span>@{profile?.username || 'membro'}</span>
            <small>{profile?.role === 'member' ? 'Membro' : profile?.role}</small>
          </div>
        </div>
        {profile?.status_message && <p className="user-status">“{profile.status_message}”</p>}
        <div className="quick-stats">
          <span><b>{summary?.stats?.topics ?? 0}</b>Tópicos</span>
          <span><b>{summary?.stats?.posts ?? 0}</b>Respostas</span>
          <span><b>{summary?.stats?.reputation ?? profile?.reputation ?? 0}</b>Reputação</span>
        </div>
        <div className="quick-links">
          <button onClick={() => { onClose(); navigate('/conta/perfil') }}><Settings /> Minha conta</button>
          <button onClick={() => { onClose(); navigate(`/membro/${profile?.username}`) }}><User /> Perfil público</button>
          <button onClick={() => { onClose(); navigate('/conta/conteudo') }}><FileText /> Meu conteúdo</button>
          <button onClick={() => { onClose(); navigate('/conta/favoritos') }}><Bookmark /> Favoritos</button>
          <button onClick={() => { onClose(); navigate('/mensagens') }}><MessageCircle /> Mensagens</button>
          <button onClick={() => { onClose(); navigate('/projetos') }}><Briefcase /> Projetos</button>
          <button onClick={() => { onClose(); navigate('/conta/notificacoes') }}><Bell /> Notificações</button>
          {['moderator','admin'].includes(profile?.role) && (
            <button onClick={() => { onClose(); navigate('/moderacao') }}><Shield /> Moderação</button>
          )}
          <button onClick={() => { onClose(); onSignOut() }}><UserMinus /> Sair</button>
        </div>
        <small className="quick-email">{session?.user?.email}</small>
      </aside>
    </>
  )
}

export function PublicProfilePage({ username, session, navigate, notify }) {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('atividade')
  const [following, setFollowing] = useState(false)
  const [ignored, setIgnored] = useState(false)
  const currentId = session?.user?.id

  async function load() {
    try {
      const next = await getPublicProfile(username)
      setData(next)
      if (currentId && currentId !== next.profile.id) {
        setFollowing(await getFollowState(currentId, next.profile.id))
      }
    } catch {
      setData(null)
    }
  }

  useEffect(() => { load() }, [username, currentId])

  if (!data) {
    return <CommunityShell title="Perfil" onBack={() => navigate('/membros')}><p className="community-empty">Perfil não encontrado.</p></CommunityShell>
  }

  const { profile, stats, topics, posts, badges, featuredProjects = [] } = data
  const isSelf = currentId === profile.id
  const activity = [...topics.map((item) => ({ kind: 'topic', date: item.created_at, item })), ...posts.map((item) => ({ kind: 'post', date: item.created_at, item }))].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,30)
  const birthParts = []
  if (profile.public_birth_day && profile.public_birth_month) birthParts.push(`${String(profile.public_birth_day).padStart(2,'0')}/${String(profile.public_birth_month).padStart(2,'0')}`)
  if (profile.public_birth_year) birthParts.push(String(profile.public_birth_year))

  async function follow() {
    try {
      const next = await toggleFollow(currentId, profile.id)
      setFollowing(next)
      await load()
    } catch (error) { notify(error?.message || 'Não foi possível seguir este membro.') }
  }

  async function ignore() {
    try {
      const next = await toggleIgnore(currentId, profile.id)
      setIgnored(next)
      notify(next ? 'Usuário ignorado.' : 'Usuário removido da lista de ignorados.')
    } catch (error) { notify(error?.message || 'Não foi possível alterar a lista de ignorados.') }
  }

  return (
    <CommunityShell title={profile.display_name || profile.username} onBack={() => navigate('/membros')}>
      <div
        className={'public-profile-hero ' + (profile.cover_url ? 'has-cover' : '')}
        style={profile.cover_url ? { '--profile-cover': `url("${profile.cover_url}")` } : undefined}
      >
        <Avatar profile={profile} size={128} />
        <div className="public-profile-main">
          <h2>{profile.display_name || profile.username}</h2>
          <span className="profile-handle">@{profile.username}</span>
          {profile.status_message && <p className="profile-status">{profile.status_message}</p>}
          <div className="profile-meta">
            <span><Calendar /> Membro desde {formatDate(profile.created_at)}</span>
            {profile.show_online && <span><BadgeCheck /> Visto {formatRelative(profile.last_seen_at)}</span>}
            {profile.occupation && <span><Briefcase /> {profile.occupation}</span>}
            {profile.location && <span><MapPin /> {profile.location}</span>}
            {birthParts.length > 0 && <span><Calendar /> {birthParts.join('/')}</span>}
            {profile.login_streak > 0 && <span>🔥 Sequência de {profile.login_streak} dia{profile.login_streak === 1 ? '' : 's'}</span>}
            <span><Trophy /> {reputationLevel(stats.reputation)} · {stats.reputation} XP</span>
          </div>
        </div>
        {!isSelf && currentId && (
          <div className="profile-actions-public">
            {profile.allow_follow && <button className="action" onClick={follow}>{following ? <UserMinus /> : <UserPlus />}{following ? 'Deixar de seguir' : 'Seguir'}</button>}
            {profile.allow_dm !== 'none' && <button className="action" onClick={() => navigate(`/mensagens/${profile.username}`)}><MessageCircle /> Mensagem</button>}
            <button className="action subtle" onClick={ignore}><UserX /> {ignored ? 'Parar de ignorar' : 'Ignorar'}</button>
            <ReportButton
              session={session}
              targetType="profile"
              targetId={profile.id}
              notify={notify}
            />
          </div>
        )}
      </div>

      <div className="profile-statbar">
        <span><b>{stats.topics}</b>Tópicos</span>
        <span><b>{stats.posts}</b>Respostas</span>
        <span><b>{stats.reactions}</b>Reações</span>
        <span><b>{stats.reputation}</b>XP</span>
        <span><b>{profile.show_followers ? stats.followers : '—'}</b>Seguidores</span>
        <span><b>{profile.show_followers ? stats.following : '—'}</b>Seguindo</span>
      </div>

      <nav className="community-tabs">
        {['atividade','topicos','sobre','trofeus'].map((value) => (
          <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>
            {value === 'topicos' ? 'Tópicos' : value === 'trofeus' ? 'Troféus' : value[0].toUpperCase()+value.slice(1)}
          </button>
        ))}
      </nav>

      <div className="community-section">
        {tab === 'atividade' && (
          <div className="activity-feed">
            {profile.show_activity ? activity.map((entry) => (
              <button key={entry.kind + entry.item.id} onClick={() => navigate(`/topico/${entry.kind === 'topic' ? entry.item.id : entry.item.topic_id}`)}>
                <strong>{entry.kind === 'topic' ? 'Criou um tópico' : 'Respondeu em um tópico'}</strong>
                <span>{entry.kind === 'topic' ? entry.item.title : entry.item.topics?.title}</span>
                <small>{formatRelative(entry.date)}</small>
              </button>
            )) : <p className="community-empty">Este membro ocultou a atividade pública.</p>}
            {profile.show_activity && !activity.length && <p className="community-empty">Ainda não há atividade pública.</p>}
          </div>
        )}
        {tab === 'topicos' && (
          <div className="simple-list">
            {topics.map((topic) => <button key={topic.id} onClick={() => navigate(`/topico/${topic.id}`)}><strong>{topic.title}</strong><small>{formatDate(topic.created_at)} · {topic.views} visualizações</small></button>)}
            {!topics.length && <p className="community-empty">Nenhum tópico publicado.</p>}
          </div>
        )}
        {tab === 'sobre' && (
          <div className="profile-about">
            <h3>Sobre</h3>
            <p>{profile.bio || 'Este membro ainda não escreveu uma apresentação.'}</p>
            <h3>Áreas de interesse</h3>
            <div className="interest-chips">{(profile.interests ?? []).map((interest) => <span key={interest}>{interest}</span>)}</div>
            {(profile.skills || []).length > 0 && <><h3>Habilidades</h3><div className="interest-chips skill-chips">{profile.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></>}
            {(profile.technologies || []).length > 0 && <><h3>Tecnologias favoritas</h3><div className="interest-chips tech-chips">{profile.technologies.map((tech) => <span key={tech}>{tech}</span>)}</div></>}
            {featuredProjects.length > 0 && (
              <>
                <h3>Projetos destacados</h3>
                <div className="featured-projects-public">
                  {featuredProjects.map((project) => (
                    <button key={project.id} onClick={() => navigate('/projetos/' + encodeURIComponent(project.slug))}>
                      <Briefcase />
                      <span><strong>{project.title}</strong><small>{project.summary}</small></span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {(profile.website_url || profile.portfolio_url || profile.github_url || profile.linkedin_url || profile.discord_handle) && (
              <>
                <h3>Links e redes</h3>
                <div className="public-links">
                  {profile.website_url && <a href={profile.website_url} target="_blank" rel="noreferrer">Website</a>}
                  {profile.portfolio_url && <a href={profile.portfolio_url} target="_blank" rel="noreferrer">Portfólio</a>}
                  {profile.github_url && <a href={profile.github_url} target="_blank" rel="noreferrer">GitHub</a>}
                  {profile.linkedin_url && <a href={profile.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a>}
                  {profile.discord_handle && <span>Discord: {profile.discord_handle}</span>}
                </div>
              </>
            )}
            {profile.signature && <><h3>Assinatura</h3><div className="signature-preview">{profile.signature}</div></>}
          </div>
        )}
        {tab === 'trofeus' && (
          <div className="badge-grid">
            {badges.map((entry) => <div key={entry.badges?.id}><span>{entry.badges?.icon}</span><strong>{entry.badges?.name}</strong><small>{entry.badges?.description}</small></div>)}
            {!badges.length && <p className="community-empty">Nenhum troféu conquistado ainda.</p>}
          </div>
        )}
      </div>
    </CommunityShell>
  )
}

const accountSections = [
  ['perfil','Detalhes da conta', User],
  ['seguranca','Senha e segurança', Shield],
  ['privacidade','Privacidade', Shield],
  ['aparencia','Aparência', Palette],
  ['preferencias','Preferências', Settings],
  ['conectadas','Contas conectadas', Link2],
  ['alertas','Alertas e e-mails', Bell],
  ['notificacoes','Notificações', Bell],
  ['atualizacoes','Atualizações da conta', FileText],
  ['conteudo','Seu conteúdo', FileText],
  ['favoritos','Favoritos', Bookmark],
  ['reacoes','Reações recebidas', Heart],
  ['seguidores','Seguidores', Users],
  ['seguindo','Seguindo', Users],
  ['ignorados','Ignorados', UserX],
]

export function AccountPage({ section = 'perfil', session, profile, setProfile, navigate, notify, appearance, setAppearance }) {
  const userId = session?.user?.id
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState(profile || {})
  const [busy, setBusy] = useState(false)
  const [extra, setExtra] = useState(null)
  const [projectChoices, setProjectChoices] = useState([])
  const [featuredProjectIds, setFeaturedProjectIds] = useState([])

  async function loadBase() {
    if (!userId) return
    try {
      const next = await getAccountSettings(userId)
      setSettings(next)
      setDraft(profile || {})
    } catch (error) { notify(error?.message || 'Não foi possível carregar as configurações.') }
  }

  async function loadExtra() {
    if (!userId) return
    try {
      if (section === 'conteudo') setExtra(await getMyContent(userId))
      else if (section === 'favoritos') setExtra(await getBookmarks(userId))
      else if (section === 'reacoes') setExtra(await getReceivedReactions(userId))
      else if (section === 'seguidores') setExtra(await getFollowers(userId))
      else if (section === 'seguindo') setExtra(await getFollowing(userId))
      else if (section === 'ignorados') setExtra(await getIgnored(userId))
      else if (section === 'notificacoes') setExtra(await getNotifications(userId))
      else setExtra(null)
    } catch (error) { notify(error?.message || 'Não foi possível carregar esta seção.') }
  }

  useEffect(() => { loadBase() }, [userId, profile?.id])
  useEffect(() => { loadExtra() }, [userId, section])
  useEffect(() => {
    if (!userId) return
    Promise.all([getEligibleFeaturedProjects(userId), getFeaturedProjects(userId)])
      .then(([choices, featured]) => {
        setProjectChoices(choices)
        setFeaturedProjectIds(featured.map((item) => item.id))
      })
      .catch(() => {
        setProjectChoices([])
        setFeaturedProjectIds([])
      })
  }, [userId])

  if (!session) {
    return <CommunityShell title="Sua conta" onBack={() => navigate('/')}><p className="community-empty">Entre para acessar as configurações.</p></CommunityShell>
  }
  if (!settings) {
    return <CommunityShell title="Sua conta" onBack={() => navigate('/')}><p className="community-empty">Carregando...</p></CommunityShell>
  }

  function setProfileField(field, value) { setDraft((current) => ({ ...current, [field]: value })) }
  function setSetting(field, value) { setSettings((current) => ({ ...current, [field]: value })) }

  async function save(event) {
    event?.preventDefault()
    if (!settings.birth_date) return notify('A data de nascimento é obrigatória.')
    if (!draft.occupation?.trim()) return notify('A ocupação é obrigatória.')
    setBusy(true)
    try {
      const payload = {
        username: draft.username?.trim(),
        display_name: draft.display_name?.trim(),
        bio: draft.bio || '',
        occupation: draft.occupation.trim(),
        interests: Array.isArray(draft.interests) ? draft.interests : [],
        status_message: draft.status_message || '',
        signature: draft.signature || '',
        show_activity: Boolean(draft.show_activity),
        show_online: Boolean(draft.show_online),
        allow_follow: Boolean(draft.allow_follow),
        show_followers: Boolean(draft.show_followers),
        allow_dm: draft.allow_dm || 'members',
        profile_visibility: draft.profile_visibility || 'public',
        website_url: draft.website_url?.trim() || null,
        github_url: draft.github_url?.trim() || null,
        linkedin_url: draft.linkedin_url?.trim() || null,
        discord_handle: draft.discord_handle?.trim() || null,
        portfolio_url: draft.portfolio_url?.trim() || null,
        skills: Array.isArray(draft.skills) ? draft.skills : [],
        technologies: Array.isArray(draft.technologies) ? draft.technologies : [],
      }
      const result = await saveAccountProfile(userId, {
        profile: payload,
        settings: {
          birth_date: settings.birth_date,
          location_private: settings.location_private || null,
          theme: settings.theme,
          language: settings.language,
          density: settings.density,
          email_updates: Boolean(settings.email_updates),
          content_filter: settings.content_filter,
          show_birth_day: Boolean(settings.show_birth_day),
          show_birth_year: Boolean(settings.show_birth_year),
          show_location: Boolean(settings.show_location),
        },
      })
      await saveFeaturedProjects(userId, featuredProjectIds)
      setProfile(result.profile)
      setDraft(result.profile)
      if (settings.theme !== 'system') setAppearance(settings.theme)
      document.documentElement.dataset.density = settings.density
      notify('Configurações salvas.')
    } catch (error) {
      notify(error?.message || 'Não foi possível salvar as configurações.')
    } finally { setBusy(false) }
  }

  async function avatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const next = await uploadAvatar(userId, file)
      setProfile(next)
      setDraft(next)
      notify('Avatar atualizado.')
    } catch (error) { notify(error?.message || 'Não foi possível atualizar o avatar.') }
    finally { setBusy(false) }
  }

  async function coverChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const next = await uploadProfileCover(userId, file)
      setProfile(next)
      setDraft(next)
      notify('Capa do perfil atualizada.')
    } catch (error) { notify(error?.message || 'Não foi possível atualizar a capa.') }
    finally { setBusy(false) }
  }

  function toggleFeaturedProject(projectId) {
    setFeaturedProjectIds((current) => {
      if (current.includes(projectId)) return current.filter((id) => id !== projectId)
      if (current.length >= 3) {
        notify('Você pode destacar até 3 projetos.')
        return current
      }
      return [...current, projectId]
    })
  }

  const identities = session.user.identities ?? []
  const providers = new Set(identities.map((identity) => identity.provider))

  return (
    <CommunityShell title="Sua conta" onBack={() => navigate('/')}>
      <div className="account-layout">
        <nav className="account-nav">
          {accountSections.map(([key,label,Icon]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => navigate(`/conta/${key}`)}><Icon /> {label}</button>)}
          <button onClick={() => navigate('/mensagens')}><MessageCircle /> Mensagens</button>
        </nav>

        <div className="account-content">
          {section === 'perfil' && (
            <form className="account-form" onSubmit={save}>
              {!draft.profile_completed && <div className="profile-required-note">Complete os campos obrigatórios para finalizar seu perfil.</div>}
              <div className="profile-cover-editor" style={draft.cover_url ? { backgroundImage: `url("${draft.cover_url}")` } : undefined}>
                <span>{draft.cover_url ? 'Capa atual' : 'Adicione uma capa ao seu perfil'}</span>
                <label className="action"><Upload /> Alterar capa<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={coverChange} hidden /></label>
              </div>
              <div className="avatar-editor">
                <Avatar profile={draft} size={96} />
                <label className="action"><Upload /> Alterar avatar<input type="file" accept="image/*" onChange={avatarChange} hidden /></label>
              </div>
              <label>Nome de usuário *<input required minLength={3} maxLength={30} value={draft.username || ''} onChange={(e) => setProfileField('username', e.target.value)} /></label>
              <label>Nome exibido<input maxLength={60} value={draft.display_name || ''} onChange={(e) => setProfileField('display_name', e.target.value)} /></label>
              <label>
                Data de nascimento *
                <input
                  required
                  type="date"
                  value={settings.birth_date || ''}
                  disabled={Boolean(settings.birth_date)}
                  onChange={(e) => setSetting('birth_date', e.target.value)}
                />
                {settings.birth_date && <small className="field-help">A data de nascimento já foi definida e não pode mais ser alterada. Em caso de erro, fale com a administração.</small>}
              </label>
              <label>Localização (opcional)<input maxLength={100} value={settings.location_private || ''} onChange={(e) => setSetting('location_private', e.target.value)} placeholder="Cidade, estado ou país" /></label>
              <label>Ocupação *<input required maxLength={100} value={draft.occupation || ''} onChange={(e) => setProfileField('occupation', e.target.value)} placeholder="Ex.: Desenvolvedor, Designer, Estudante" /></label>
              <label>Áreas de interesse<input value={(draft.interests || []).join(', ')} onChange={(e) => setProfileField('interests', e.target.value.split(',').map((v) => v.trim()).filter(Boolean).slice(0,20))} placeholder="IA, programação, hardware, games..." /></label>
              <label>Habilidades<input value={(draft.skills || []).join(', ')} onChange={(e) => setProfileField('skills', e.target.value.split(',').map((v) => v.trim()).filter(Boolean).slice(0,30))} placeholder="Frontend, UX, DevOps, escrita..." /></label>
              <label>Tecnologias favoritas<input value={(draft.technologies || []).join(', ')} onChange={(e) => setProfileField('technologies', e.target.value.split(',').map((v) => v.trim()).filter(Boolean).slice(0,30))} placeholder="React, Python, Supabase, Docker..." /></label>
              <label>Site pessoal<input type="url" maxLength={250} value={draft.website_url || ''} onChange={(e) => setProfileField('website_url', e.target.value)} placeholder="https://seusite.com" /></label>
              <label>Portfólio<input type="url" maxLength={250} value={draft.portfolio_url || ''} onChange={(e) => setProfileField('portfolio_url', e.target.value)} placeholder="https://portfolio.dev" /></label>
              <label>GitHub público<input type="url" maxLength={250} value={draft.github_url || ''} onChange={(e) => setProfileField('github_url', e.target.value)} placeholder="https://github.com/usuario" /></label>
              <label>LinkedIn<input type="url" maxLength={250} value={draft.linkedin_url || ''} onChange={(e) => setProfileField('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/usuario" /></label>
              <label>Discord<input maxLength={100} value={draft.discord_handle || ''} onChange={(e) => setProfileField('discord_handle', e.target.value)} placeholder="@usuario" /></label>
              <label>Status<input maxLength={120} value={draft.status_message || ''} onChange={(e) => setProfileField('status_message', e.target.value)} placeholder="Uma frase curta sobre você" /></label>
              <label>Sobre você<textarea maxLength={1200} value={draft.bio || ''} onChange={(e) => setProfileField('bio', e.target.value)} /></label>
              <label>Assinatura do fórum<textarea maxLength={500} value={draft.signature || ''} onChange={(e) => setProfileField('signature', e.target.value)} placeholder="Aparecerá abaixo das suas respostas." /></label>
              {projectChoices.length > 0 && (
                <fieldset className="featured-project-picker">
                  <legend>Projetos destacados no perfil <small>(até 3)</small></legend>
                  {projectChoices.map((project) => (
                    <label key={project.id}>
                      <input
                        type="checkbox"
                        checked={featuredProjectIds.includes(project.id)}
                        onChange={() => toggleFeaturedProject(project.id)}
                      />
                      <span><strong>{project.title}</strong><small>{project.summary}</small></span>
                    </label>
                  ))}
                </fieldset>
              )}
              <button className="action primary-action" disabled={busy}><Save /> Salvar</button>
            </form>
          )}

          {section === 'privacidade' && (
            <form className="account-form option-form" onSubmit={save}>
              <label>Quem pode ver meu perfil<select value={draft.profile_visibility || 'public'} onChange={(e) => setProfileField('profile_visibility', e.target.value)}><option value="public">Todos</option><option value="members">Somente membros logados</option><option value="private">Somente eu</option></select></label>
              <label><input type="checkbox" checked={draft.show_activity ?? true} onChange={(e) => setProfileField('show_activity', e.target.checked)} /> Mostrar minha atividade no perfil público</label>
              <label><input type="checkbox" checked={draft.show_online ?? true} onChange={(e) => setProfileField('show_online', e.target.checked)} /> Mostrar última atividade/status online</label>
              <label><input type="checkbox" checked={draft.allow_follow ?? true} onChange={(e) => setProfileField('allow_follow', e.target.checked)} /> Permitir que membros me sigam</label>
              <label><input type="checkbox" checked={draft.show_followers ?? true} onChange={(e) => setProfileField('show_followers', e.target.checked)} /> Mostrar seguidores/seguindo</label>
              <label><input type="checkbox" checked={settings.show_location} onChange={(e) => setSetting('show_location', e.target.checked)} /> Mostrar localização no perfil</label>
              <label><input type="checkbox" checked={settings.show_birth_day} onChange={(e) => setSetting('show_birth_day', e.target.checked)} /> Mostrar dia e mês de nascimento</label>
              <label><input type="checkbox" checked={settings.show_birth_year} onChange={(e) => setSetting('show_birth_year', e.target.checked)} /> Mostrar ano de nascimento</label>
              <label>Quem pode enviar mensagens diretas<select value={draft.allow_dm || 'members'} onChange={(e) => setProfileField('allow_dm', e.target.value)}><option value="members">Membros</option><option value="following">Somente quem eu sigo</option><option value="none">Ninguém</option></select></label>
              <button className="action primary-action" disabled={busy}><Save /> Salvar privacidade</button>
            </form>
          )}

          {section === 'seguranca' && (
            <SecuritySection
              session={session}
              profile={draft}
              setProfile={setProfile}
              navigate={navigate}
              notify={notify}
            />
          )}

          {section === 'aparencia' && (
            <AppearanceSection
              userId={userId}
              settings={settings}
              setSettings={setSettings}
              setAppearance={setAppearance}
              notify={notify}
            />
          )}

          {section === 'preferencias' && (
            <form className="account-form" onSubmit={save}>
              <label>Filtro de conteúdo<select value={settings.content_filter} onChange={(e) => setSetting('content_filter', e.target.value)}><option value="standard">Padrão</option><option value="strict">Mais restrito</option></select></label>
              <button className="action primary-action" disabled={busy}><Save /> Salvar preferências</button>
            </form>
          )}

          {section === 'alertas' && (
            <NotificationPreferencesSection
              userId={userId}
              settings={settings}
              setSettings={setSettings}
              notify={notify}
            />
          )}

          {section === 'atualizacoes' && (
            <AccountUpdatesSection userId={userId} />
          )}

          {section === 'conectadas' && (
            <div className="connected-list">
              {['google','github'].map((provider) => {
                const connected = providers.has(provider)
                return <div key={provider}><strong>{provider === 'google' ? 'Google' : 'GitHub'}</strong><span>{connected ? 'Conectado' : 'Não conectado'}</span>{!connected && <button className="action" onClick={() => linkIdentity(provider).catch((e) => notify(e.message))}>Conectar</button>}</div>
              })}
              <div><strong>E-mail</strong><span>{session.user.email}</span></div>
            </div>
          )}

          {section === 'conteudo' && <ContentSection data={extra} navigate={navigate} />}
          {section === 'favoritos' && <BookmarksSection data={extra} navigate={navigate} />}
          {section === 'reacoes' && <ReactionsSection data={extra} navigate={navigate} />}
          {section === 'seguidores' && <PeopleSection data={extra} navigate={navigate} />}
          {section === 'seguindo' && <PeopleSection data={extra} navigate={navigate} />}
          {section === 'ignorados' && <IgnoredSection data={extra} userId={userId} reload={loadExtra} notify={notify} navigate={navigate} />}
          {section === 'notificacoes' && <AccountNotifications data={extra} reload={loadExtra} userId={userId} navigate={navigate} />}
        </div>
      </div>
    </CommunityShell>
  )
}

function ContentSection({ data, navigate }) {
  if (!data) return <p className="community-empty">Carregando...</p>
  return <div className="account-list"><h2>Meus tópicos</h2>{data.topics.map((item) => <button key={item.id} onClick={() => navigate(`/topico/${item.id}`)}><strong>{item.title}</strong><small>{formatDate(item.created_at)}</small></button>)}<h2>Minhas respostas</h2>{data.posts.map((item) => <button key={item.id} onClick={() => navigate(`/topico/${item.topic_id}`)}><strong>{item.topics?.title}</strong><span>{item.content.slice(0,100)}</span></button>)}</div>
}
function BookmarksSection({ data, navigate }) {
  if (!data) return <p className="community-empty">Carregando...</p>
  return <div className="account-list">{data.map((item) => <button key={item.id} onClick={() => navigate(`/topico/${item.topics?.id}`)}><strong>{item.topics?.title}</strong><small>Salvo em {formatDate(item.created_at)}</small></button>)}{!data.length && <p className="community-empty">Nenhum tópico salvo.</p>}</div>
}
function ReactionsSection({ data, navigate }) {
  if (!data) return <p className="community-empty">Carregando...</p>
  return <div className="account-list">{data.map((item) => <button key={item.id} onClick={() => item.target?.id && navigate(`/topico/${item.target.id}`)}><strong>{item.actor?.display_name || item.actor?.username} reagiu à sua publicação</strong><span>{item.target?.title || 'Discussão'}</span><small>{formatRelative(item.created_at)}</small></button>)}{!data.length && <p className="community-empty">Nenhuma reação recebida.</p>}</div>
}
function PeopleSection({ data, navigate }) {
  if (!data) return <p className="community-empty">Carregando...</p>
  return <div className="people-grid">{data.map((item) => <button key={item.profile?.id} onClick={() => navigate(`/membro/${item.profile?.username}`)}><Avatar profile={item.profile} size={48}/><span><strong>{item.profile?.display_name || item.profile?.username}</strong><small>@{item.profile?.username}</small></span></button>)}{!data.length && <p className="community-empty">Nenhum membro nesta lista.</p>}</div>
}
function IgnoredSection({ data, userId, reload, notify, navigate }) {
  if (!data) return <p className="community-empty">Carregando...</p>
  return <div className="people-grid">{data.map((item) => <div className="ignored-person" key={item.profile?.id}><button onClick={() => navigate(`/membro/${item.profile?.username}`)}><Avatar profile={item.profile} size={48}/><span><strong>{item.profile?.display_name || item.profile?.username}</strong><small>@{item.profile?.username}</small></span></button><button className="action" onClick={async () => { await toggleIgnore(userId,item.profile.id); notify('Usuário removido da lista de ignorados.'); reload() }}>Remover</button></div>)}{!data.length && <p className="community-empty">Nenhum usuário ignorado.</p>}</div>
}
function AccountNotifications({ data, reload, userId, navigate }) {
  if (!data) return <p className="community-empty">Carregando...</p>
  return <div className="account-list"><button className="action mark-all" onClick={async()=>{await markAllNotificationsRead(userId); reload()}}>Marcar todas como lidas</button>{data.map((item) => <button className={item.read ? '' : 'unread'} key={item.id} onClick={async()=>{await markNotificationRead(item.id); if(item.data?.topic_id) navigate(`/topico/${item.data.topic_id}`); else if(item.type==='direct_message' && item.actor?.username) navigate(`/mensagens/${item.actor.username}`); reload()}}><strong>{notificationTitle(item)}</strong><span>{item.actor?.display_name || item.actor?.username || 'CreativeZone'}</span><small>{formatRelative(item.created_at)}</small></button>)}</div>
}

function notificationTitle(item) {
  if (item.type === 'topic_watch') {
    if (item.data?.event === 'reply') return 'Nova resposta em tópico assistido'
    if (item.data?.event === 'reply_update') return 'Resposta atualizada em tópico assistido'
    return 'Tópico assistido foi atualizado'
  }

  return {
    new_reply: 'Nova resposta no seu tópico',
    mention: 'Você foi mencionado',
    chat_mention: 'Menção no Chat da Comunidade',
    quote: 'Sua publicação foi citada',
    reaction: 'Você recebeu uma reação',
    new_follower: 'Novo seguidor',
    direct_message: 'Nova mensagem direta',
    moderation: 'Aviso da moderação',
    category_suggestion: 'Nova sugestão de categoria',
  }[item.type] || 'Nova notificação'
}

export function NotificationsPanel({ session, navigate, onClose }) {
  const [items, setItems] = useState([])
  const userId = session?.user?.id

  async function refreshNotifications() {
    if (!userId) return
    try {
      setItems(await getNotifications(userId))
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    refreshNotifications()
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId) return undefined
    const channel = supabase
      .channel('creativezone-personal-notifications-' + userId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        refreshNotifications
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  if (!session) return <p className="community-empty">Entre para ver suas notificações.</p>
  return <div className="overlay-notifications personal-notifications"><button className="mark-all-overlay" onClick={async()=>{await markAllNotificationsRead(session.user.id); setItems(await getNotifications(session.user.id))}}>Marcar todas como lidas</button>{items.map((item)=><button key={item.id} className={item.read?'':'unread'} onClick={async()=>{await markNotificationRead(item.id); onClose(); if(item.data?.path) navigate(item.data.path); else if(item.data?.topic_id) navigate(`/topico/${item.data.topic_id}`); else if(item.type==='direct_message' && item.actor?.username) navigate(`/mensagens/${item.actor.username}`)}}><Avatar profile={item.actor} size={40}/><span><strong>{notificationTitle(item)}</strong><small>{item.actor?.display_name || item.actor?.username || 'CreativeZone'} · {formatRelative(item.created_at)}</small></span></button>)}{!items.length&&<p className="community-empty">Nenhuma notificação.</p>}</div>
}

export function MessagesPage({ username, session, members, navigate, notify }) {
  const userId = session?.user?.id
  const [inbox, setInbox] = useState([])
  const [partner, setPartner] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [messageSearchResults, setMessageSearchResults] = useState([])

  async function loadInbox() {
    if (!userId) return
    try { setInbox(await getInbox(userId)) } catch (error) { notify(error?.message || 'Não foi possível carregar as mensagens.') }
  }
  async function loadPartner() {
    if (!username || !userId) { setPartner(null); setMessages([]); return }
    try {
      const publicData = await getPublicProfile(username)
      setPartner(publicData.profile)
      setMessages(await getConversation(userId, publicData.profile.id))
      loadInbox()
    } catch (error) { notify(error?.message || 'Não foi possível abrir a conversa.') }
  }

  useEffect(() => { loadInbox() }, [userId])
  useEffect(() => { loadPartner() }, [username, userId])

  useEffect(() => {
    if (!userId || search.trim().length < 2) {
      setMessageSearchResults([])
      return undefined
    }

    const timer = setTimeout(() => {
      searchDirectMessages(userId, search)
        .then(setMessageSearchResults)
        .catch(() => setMessageSearchResults([]))
    }, 250)

    return () => clearTimeout(timer)
  }, [userId, search])

  useEffect(() => {
    if (!supabase || !userId) return undefined
    const channel = supabase
      .channel('creativezone-direct-message-alerts-' + userId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          if (payload.new?.type !== 'direct_message') return
          await loadInbox()
          if (partner?.id) {
            try {
              setMessages(await getConversation(userId, partner.id))
            } catch {}
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, partner?.id])

  if (!session) return <CommunityShell title="Mensagens" onBack={()=>navigate('/')}><p className="community-empty">Entre para usar mensagens diretas.</p></CommunityShell>

  async function send(event) {
    event.preventDefault()
    if (!partner || !text.trim()) return
    try {
      await sendDirectMessage(userId, partner.id, text.trim())
      setText('')
      setMessages(await getConversation(userId, partner.id))
      loadInbox()
    } catch (error) { notify(error?.message || 'Não foi possível enviar a mensagem.') }
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filteredInbox = normalizedSearch
    ? inbox.filter((item) =>
        ((item.partner?.display_name || '') + ' ' +
          (item.partner?.username || '') + ' ' +
          (item.lastMessage?.content || ''))
          .toLowerCase()
          .includes(normalizedSearch)
      )
    : inbox
  const filteredMembers = normalizedSearch
    ? (members || []).filter((member) =>
        ((member.display_name || '') + ' ' + (member.username || ''))
          .toLowerCase()
          .includes(normalizedSearch)
      )
    : (members || [])
  const filteredMessages = normalizedSearch
    ? messages.filter((message) => message.content.toLowerCase().includes(normalizedSearch))
    : messages

  return (
    <CommunityShell title="Mensagens diretas" onBack={()=>navigate('/')}>
      <div className="messages-layout">
        <aside className="conversation-list">
          <input className="dm-search" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar pessoa ou mensagem..." />
          <h3>Conversas</h3>
          {filteredInbox.map((item) => <button className={partner?.id===item.partner?.id?'active':''} key={item.partner?.id} onClick={()=>navigate(`/mensagens/${item.partner?.username}`)}><Avatar profile={item.partner} size={42}/><span><strong>{item.partner?.display_name || item.partner?.username}</strong><small>{item.lastMessage.content.slice(0,50)}</small></span>{item.unread>0&&<b>{item.unread}</b>}</button>)}
          {messageSearchResults.length > 0 && (
            <>
              <h3>Resultados em mensagens</h3>
              {messageSearchResults.slice(0,20).map((result) => {
                const other = result.sender_id === userId ? result.recipient : result.sender
                return (
                  <button key={result.id} onClick={()=>other?.username && navigate(`/mensagens/${other.username}`)}>
                    <Avatar profile={other} size={36}/>
                    <span>
                      <strong>{other?.display_name || other?.username || 'Membro'}</strong>
                      <small>{result.content.slice(0,70)}</small>
                    </span>
                  </button>
                )
              })}
            </>
          )}
          <h3>Nova conversa</h3>
          {filteredMembers.filter((m)=>m.id!==userId).slice(0,20).map((member)=><button key={member.id} onClick={()=>navigate(`/mensagens/${member.username}`)}><Avatar profile={member} size={36}/><span><strong>{member.display_name||member.username}</strong><small>@{member.username}</small></span></button>)}
        </aside>
        <section className="conversation-pane">
          {!partner ? <p className="community-empty">Escolha um membro para iniciar uma conversa.</p> : <>
            <header><button onClick={()=>navigate(`/membro/${partner.username}`)}><Avatar profile={partner} size={44}/><span><strong>{partner.display_name||partner.username}</strong><small>@{partner.username}</small></span></button></header>
            <div className="message-stream">{filteredMessages.map((message)=><div key={message.id} className={message.sender_id===userId?'mine':'theirs'}><span>{message.content}</span><small>{formatRelative(message.created_at)}</small></div>)}</div>
            <form className="message-composer" onSubmit={send}><textarea required maxLength={5000} value={text} onChange={(e)=>setText(e.target.value)} placeholder="Escreva uma mensagem..."/><button className="action primary-action"><Send/>Enviar</button></form>
          </>}
        </section>
      </div>
    </CommunityShell>
  )
}
