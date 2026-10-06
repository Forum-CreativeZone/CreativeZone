import React, { useEffect, useMemo, useRef } from 'react'
import { gsap } from 'gsap'

const FRACTURE_EFFECTS = new Set(['fracture','architect-core'])
const CHAR_EFFECTS = new Set(['fracture','kinetic','architect-core'])
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>[]{}#@!?*/+-='

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function setPointerVars(event) {
  const element = event.currentTarget
  const rect = element.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100
  const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100
  element.style.setProperty('--fx-x', x.toFixed(2) + '%')
  element.style.setProperty('--fx-y', y.toFixed(2) + '%')
  element.style.setProperty('--fx-xn', ((x - 50) / 50).toFixed(3))
  element.style.setProperty('--fx-yn', ((y - 50) / 50).toFixed(3))
}

function clearPointerVars(event) {
  const element = event.currentTarget
  element.style.removeProperty('--fx-x')
  element.style.removeProperty('--fx-y')
  element.style.removeProperty('--fx-xn')
  element.style.removeProperty('--fx-yn')
}

function splitChars(text) {
  return Array.from(String(text || ''))
}

export function EffectName({
  text = '',
  effect = 'clean',
  color = null,
  as = 'span',
  className = '',
  title,
}) {
  const rootRef = useRef(null)
  const tweenRef = useRef(null)
  const chars = useMemo(() => splitChars(text), [text])
  const needsChars = CHAR_EFFECTS.has(effect)
  const Tag = as

  useEffect(() => {
    const root = rootRef.current
    if (!root || prefersReducedMotion()) return undefined

    const ctx = gsap.context(() => {
      if (FRACTURE_EFFECTS.has(effect)) {
        const nodes = root.querySelectorAll('.cz-effect-char')
        gsap.fromTo(nodes, {
          x: (index) => ((index % 2 ? 1 : -1) * (18 + (index % 5) * 7)),
          y: (index) => ((index % 3) - 1) * 18,
          rotation: (index) => (index % 2 ? 1 : -1) * (8 + (index % 4) * 9),
          scale: (index) => 0.45 + (index % 3) * 0.12,
          opacity: 0,
          filter: 'blur(5px)',
        }, {
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          opacity: 1,
          filter: 'blur(0px)',
          duration: effect === 'architect-core' ? 0.95 : 0.75,
          stagger: 0.035,
          ease: 'power4.out',
          overwrite: true,
        })
      }

      if (effect === 'kinetic') {
        const nodes = root.querySelectorAll('.cz-effect-char')
        tweenRef.current = gsap.to(nodes, {
          y: (index) => index % 2 ? -2.5 : 2.5,
          rotation: (index) => index % 2 ? 1.5 : -1.5,
          duration: 0.75,
          stagger: {
            each: 0.045,
            repeat: -1,
            yoyo: true,
          },
          ease: 'sine.inOut',
        })
      }

      if (effect === 'architect-core') {
        gsap.to(root, {
          filter: 'drop-shadow(0 0 7px rgba(255,66,45,.62)) drop-shadow(0 0 14px rgba(255,174,39,.22))',
          duration: 1.6,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        })
      }
    }, root)

    return () => {
      tweenRef.current?.kill?.()
      tweenRef.current = null
      ctx.revert()
    }
  }, [effect, text])

  function runScramble() {
    if (effect !== 'scramble' || prefersReducedMotion() || !rootRef.current) return
    const root = rootRef.current
    const original = String(text || '')
    const proxy = { progress: 0 }
    tweenRef.current?.kill?.()
    tweenRef.current = gsap.fromTo(proxy, { progress: 0 }, {
      progress: 1,
      duration: 0.65,
      ease: 'power2.out',
      onUpdate: () => {
        const revealed = Math.floor(original.length * proxy.progress)
        root.textContent = Array.from(original).map((char, index) => {
          if (char === ' ') return ' '
          if (index < revealed) return char
          const seed = (index * 13 + Math.floor(proxy.progress * 41)) % SCRAMBLE_CHARS.length
          return SCRAMBLE_CHARS[seed]
        }).join('')
      },
      onComplete: () => {
        root.textContent = original
      },
    })
  }

  function handlePointerEnter() {
    runScramble()

    if (effect === 'fracture' && !prefersReducedMotion()) {
      const root = rootRef.current
      if (!root) return
      const nodes = root.querySelectorAll('.cz-effect-char')
      gsap.timeline({ defaults: { overwrite: true } })
        .to(nodes, {
          x: (index) => ((index % 2 ? 1 : -1) * (5 + (index % 4) * 2)),
          y: (index) => ((index % 3) - 1) * 5,
          rotation: (index) => (index % 2 ? 1 : -1) * 4,
          duration: 0.18,
          stagger: 0.012,
          ease: 'power2.out',
        })
        .to(nodes, {
          x: 0,
          y: 0,
          rotation: 0,
          duration: 0.48,
          stagger: 0.018,
          ease: 'elastic.out(1,.55)',
        })
    }
  }

  return (
    <Tag
      ref={rootRef}
      className={'cz-effect-name name-effect-' + effect + (className ? ' ' + className : '')}
      style={color ? { '--cz-name-color': color } : undefined}
      data-text={text}
      title={title}
      onPointerMove={setPointerVars}
      onPointerLeave={clearPointerVars}
      onPointerEnter={handlePointerEnter}
    >
      {needsChars
        ? chars.map((char, index) => (
            <span
              className="cz-effect-char"
              key={index + '-' + char}
              aria-hidden="true"
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          ))
        : text}
      {needsChars && <span className="sr-only">{text}</span>}
    </Tag>
  )
}

export function EffectBadge({
  children,
  effect = 'clean-badge',
  className = '',
  title,
}) {
  return (
    <span
      className={'cz-effect-badge badge-effect-' + effect + (className ? ' ' + className : '')}
      data-effect={effect}
      title={title}
      onPointerMove={setPointerVars}
      onPointerLeave={clearPointerVars}
    >
      <span className="cz-effect-badge-inner">{children}</span>
      {['orbit-badge','electric-badge','architect-forge'].includes(effect) && (
        <span className="cz-effect-badge-orbit" aria-hidden="true">
          <i /><i /><i />
        </span>
      )}
    </span>
  )
}

export function EffectRole({
  children,
  effect = 'clean-role',
  className = '',
  title,
}) {
  return (
    <span
      className={'cz-effect-role role-effect-' + effect + (className ? ' ' + className : '')}
      title={title}
      onPointerMove={setPointerVars}
      onPointerLeave={clearPointerVars}
    >
      {children}
    </span>
  )
}

export function EffectSurface({
  children,
  effect = 'none',
  as = 'div',
  className = '',
}) {
  const Tag = as
  return (
    <Tag
      className={'cz-effect-surface profile-effect-' + effect + (className ? ' ' + className : '')}
      onPointerMove={setPointerVars}
      onPointerLeave={clearPointerVars}
    >
      {children}
      {effect === 'architect-grid' && (
        <span className="architect-scan-grid" aria-hidden="true"><i /><i /></span>
      )}
    </Tag>
  )
}

export function EffectPreview({
  kind,
  effect,
  name = 'CreativeZone',
  color = '#ff4b3e',
  role = 'VIP',
}) {
  if (kind === 'name') {
    return <EffectName text={name} effect={effect} color={color} className="effect-preview-name" />
  }
  if (kind === 'badge') {
    return <EffectBadge effect={effect} className="effect-preview-badge">✦ ELITE</EffectBadge>
  }
  if (kind === 'role') {
    return <EffectRole effect={effect} className="effect-preview-role">◆ {role}</EffectRole>
  }
  return (
    <EffectSurface effect={effect} className="effect-preview-surface">
      <span>CreativeZone</span>
      <small>Perfil VIP</small>
    </EffectSurface>
  )
}
