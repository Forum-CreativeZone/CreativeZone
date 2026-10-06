import React from 'react'
import {
  Award,
  CalendarDays,
  MapPin,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react'
import { EffectAvatarFrame, EffectBadge, EffectName, EffectRole } from './VisualEffects'

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
  decoration = null,
}) {
  const name = profile?.display_name || profile?.username || fallbackName
  const username = profile?.username
  const avatar = profile?.avatar_url || fallbackAvatar
  const cosmetics = decoration?.cosmetics || {}
  const membership = decoration?.membership || null
  const isOwner = Boolean(decoration?.system_owner)
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
        <EffectAvatarFrame
          effect={cosmetics.avatar_frame || 'avatar-clean'}
          className="thread-avatar-frame"
          compact
        >
          {avatar ? (
            <img src={avatar} alt="" />
          ) : (
            <span className="thread-profile-fallback">{name.slice(0, 1).toUpperCase()}</span>
          )}
        </EffectAvatarFrame>
        <EffectName
          as="strong"
          text={name}
          effect={cosmetics.name_effect || 'clean'}
          color={cosmetics.name_color || null}
          className="thread-effect-name"
        />
        {username && <small>@{username}</small>}
        {cosmetics.profile_title && <em className="thread-profile-title">{cosmetics.profile_title}</em>}
      </button>

      <div className="thread-identity-badges">
        {isOwner && (
          <EffectBadge effect={cosmetics.badge_effect || 'architect-forge'} className="identity-badge architect">
            🏗️ Arquiteto CreativeZone
          </EffectBadge>
        )}
        {membership?.plan_id && membership.plan_id !== 'free' && (
          <EffectBadge
            effect={cosmetics.badge_effect || 'clean-badge'}
            className={'identity-badge membership-' + membership.plan_id + ' style-' + (cosmetics.badge_style || 'default')}
          >
            {membership.badge}{membership.permanent ? ' ∞' : ''}
          </EffectBadge>
        )}
      </div>

      <EffectRole
        effect={cosmetics.role_effect || 'clean-role'}
        className={'thread-role-badge role-' + (profile?.role || 'member')}
      >
        <ShieldCheck />
        {roleLabel(profile?.role)}
      </EffectRole>

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
  decoration,
}) {
  return (
    <article className={'thread-post-card ' + (original ? 'thread-post-original' : '')}>
      <ThreadAuthorPanel
        profile={profile}
        stats={stats}
        navigate={navigate}
        fallbackName={fallbackName}
        fallbackAvatar={fallbackAvatar}
        decoration={decoration}
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
