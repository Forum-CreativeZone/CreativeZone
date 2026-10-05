import React from 'react'
import {
  Award,
  CalendarDays,
  MapPin,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react'

function formatJoined(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatPosted(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function roleLabel(role) {
  if (role === 'admin') return 'Administrador'
  if (role === 'moderator') return 'Moderador'
  return 'Membro'
}

export function ThreadAuthorPanel({
  profile,
  stats,
  navigate,
  fallbackName = 'Membro',
  fallbackAvatar = '',
}) {
  const name = profile?.display_name || profile?.username || fallbackName
  const username = profile?.username
  const avatar = profile?.avatar_url || fallbackAvatar
  const openProfile = () => {
    if (username) navigate('/membro/' + encodeURIComponent(username))
  }

  return (
    <aside className="thread-profile-card">
      <button
        className="thread-profile-identity"
        onClick={openProfile}
        disabled={!username}
      >
        {avatar ? (
          <img src={avatar} alt="" />
        ) : (
          <span className="thread-profile-fallback">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <strong>{name}</strong>
        {username && <small>@{username}</small>}
      </button>

      <span className={'thread-role-badge role-' + (profile?.role || 'member')}>
        <ShieldCheck />
        {roleLabel(profile?.role)}
      </span>

      {profile?.occupation && (
        <p className="thread-profile-occupation">{profile.occupation}</p>
      )}
      {profile?.status_message && (
        <p className="thread-profile-status">{profile.status_message}</p>
      )}

      <dl className="thread-profile-stats">
        <div>
          <dt><CalendarDays /> Membro desde</dt>
          <dd>{formatJoined(profile?.created_at)}</dd>
        </div>
        <div>
          <dt><MessageSquareText /> Tópicos</dt>
          <dd>{stats?.topic_count ?? 0}</dd>
        </div>
        <div>
          <dt><MessageSquareText /> Respostas</dt>
          <dd>{stats?.post_count ?? 0}</dd>
        </div>
        <div>
          <dt><Award /> Reputação</dt>
          <dd>{profile?.reputation ?? 0}</dd>
        </div>
        {profile?.location && (
          <div>
            <dt><MapPin /> Localização</dt>
            <dd>{profile.location}</dd>
          </div>
        )}
      </dl>
    </aside>
  )
}

export function ThreadPostCard({
  profile,
  stats,
  navigate,
  fallbackName,
  fallbackAvatar,
  createdAt,
  number,
  original = false,
  children,
  actions,
  signature,
}) {
  return (
    <article className={'thread-post-card ' + (original ? 'thread-post-original' : '')}>
      <ThreadAuthorPanel
        profile={profile}
        stats={stats}
        navigate={navigate}
        fallbackName={fallbackName}
        fallbackAvatar={fallbackAvatar}
      />

      <div className="thread-post-content">
        <header className="thread-post-meta">
          <span>{formatPosted(createdAt)}</span>
          <a href={'#post-' + number} id={'post-' + number}>#{number}</a>
        </header>

        <div className="thread-post-body">
          {children}
        </div>

        {signature && <div className="post-signature">{signature}</div>}

        {actions && <footer className="thread-post-actions">{actions}</footer>}
      </div>
    </article>
  )
}
