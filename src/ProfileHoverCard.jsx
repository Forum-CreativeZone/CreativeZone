import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { getProfileHoverSummary } from './services/communityApi'
import { EffectName } from './VisualEffects'
import { ForumIcon } from './ForumIcon'

const hoverProfileCache = new Map()

function roleLabel(role) {
  if (role === 'admin') return 'Administrador'
  if (role === 'moderator') return 'Moderador'
  return 'Membro'
}

function formatJoined(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

export function ProfileHoverLayer() {
  const [target, setTarget] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const openTimer = useRef(null)

  function clearOpenTimer() {
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }

  function closeNow() {
    clearOpenTimer()
    setTarget(null)
    setData(null)
  }

  useEffect(() => {
    function findProfileTarget(node) {
      return node?.closest?.('[data-profile-username]') || null
    }

    function onMouseOver(event) {
      const element = findProfileTarget(event.target)
      if (!element || element.contains(event.relatedTarget)) return

      const username = element.dataset.profileUsername
      if (!username) return

      clearOpenTimer()

      openTimer.current = setTimeout(() => {
        const rect = element.getBoundingClientRect()
        setTarget({
          username,
          rect: {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
        })
      }, 220)
    }

    function onMouseOut(event) {
      const element = findProfileTarget(event.target)
      if (!element || element.contains(event.relatedTarget)) return
      closeNow()
    }

    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)

    return () => {
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      clearOpenTimer()
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!target?.username) return undefined

    const cached = hoverProfileCache.get(target.username.toLowerCase())
    if (cached) {
      setData(cached)
      setLoading(false)
      return undefined
    }

    setLoading(true)
    setData(null)

    getProfileHoverSummary(target.username)
      .then((next) => {
        if (!active) return
        hoverProfileCache.set(target.username.toLowerCase(), next)
        setData(next)
      })
      .catch(() => {
        if (active) setData(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [target?.username])

  if (!target || typeof document === 'undefined') return null

  const cardWidth = 360
  const estimatedHeight = data?.profile?.cover_url ? 355 : 295
  const left = Math.min(
    Math.max(12, target.rect.left),
    Math.max(12, window.innerWidth - cardWidth - 12)
  )
  const fitsBelow = target.rect.bottom + estimatedHeight + 12 < window.innerHeight
  const top = fitsBelow
    ? target.rect.bottom + 8
    : Math.max(12, target.rect.top - estimatedHeight - 8)

  const profile = data?.profile
  const membership = data?.membership
  const cosmetics = data?.cosmetics || {}
  const name = profile?.display_name || profile?.username || target.username

  return createPortal(
    <aside
      className="profile-hover-card"
      style={{ left, top, width: cardWidth }}
    >
      {loading ? (
        <div className="profile-hover-loading">
          <span />
          <span />
          <span />
        </div>
      ) : profile ? (
        <>
          <div
            className={'profile-hover-cover ' + (profile.cover_url ? 'has-cover' : '')}
            style={profile.cover_url ? { backgroundImage: `url("${profile.cover_url}")` } : undefined}
          />
          <div className="profile-hover-main">
            <div className="profile-hover-avatar">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" />
              ) : (
                <span>{name.slice(0, 1).toUpperCase()}</span>
              )}
            </div>

            <div className="profile-hover-identity">
              <EffectName
                as="strong"
                text={name}
                effect={cosmetics.name_effect || 'clean'}
                color={cosmetics.name_color || null}
                className="profile-hover-effect-name"
              />
              <small>@{profile.username}</small>
              <div className="profile-hover-badges">
                {profile.system_owner && <b className="architect">ARQUITETO</b>}
                {membership?.plan_id && membership.plan_id !== 'free' && (
                  <b className={'membership-' + membership.plan_id}>
                    {membership.badge || membership.plan_id.toUpperCase()}
                    {membership.permanent ? ' ∞' : ''}
                  </b>
                )}
                <b className={'role-' + (profile.role || 'member')}>
                  <ForumIcon name="shield" /> {roleLabel(profile.role)}
                </b>
              </div>
            </div>
          </div>

          {(profile.status_message || profile.occupation) && (
            <div className="profile-hover-about">
              {profile.status_message && <p>“{profile.status_message}”</p>}
              {profile.occupation && <small>{profile.occupation}</small>}
            </div>
          )}

          <div className="profile-hover-stats">
            <span><b>{data?.stats?.topics ?? 0}</b><small>Tópicos</small></span>
            <span><b>{data?.stats?.posts ?? 0}</b><small>Respostas</small></span>
            <span><b>{data?.stats?.reputation ?? profile.reputation ?? 0}</b><small>Reputação</small></span>
            <span><b>{formatJoined(profile.created_at)}</b><small>Membro desde</small></span>
          </div>


        </>
      ) : (
        <div className="profile-hover-unavailable">Perfil indisponível.</div>
      )}
    </aside>,
    document.body
  )
}
