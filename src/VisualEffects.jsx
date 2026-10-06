import React, { useEffect, useMemo, useRef } from 'react'
import { gsap } from 'gsap'

const FRACTURE_EFFECTS = new Set(['fracture','architect-core'])
const CHAR_EFFECTS = new Set(['fracture','kinetic','architect-core','wave','gsap-assemble'])
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
  const xn = (x - 50) / 50
  const yn = (y - 50) / 50

  element.style.setProperty('--fx-x', x.toFixed(2) + '%')
  element.style.setProperty('--fx-y', y.toFixed(2) + '%')
  element.style.setProperty('--fx-xn', xn.toFixed(3))
  element.style.setProperty('--fx-yn', yn.toFixed(3))
  element.style.setProperty('--fx-x-shift', (xn * 8).toFixed(2) + 'px')
  element.style.setProperty('--fx-y-shift', (yn * 8).toFixed(2) + 'px')
  element.style.setProperty('--fx-rotate-x', (yn * -3).toFixed(2) + 'deg')
  element.style.setProperty('--fx-rotate-y', (xn * 4).toFixed(2) + 'deg')
}

function clearPointerVars(event) {
  const element = event.currentTarget
  ;['--fx-x','--fx-y','--fx-xn','--fx-yn','--fx-x-shift','--fx-y-shift','--fx-rotate-x','--fx-rotate-y']
    .forEach((name) => element.style.removeProperty(name))
}

function splitChars(text) {
  return Array.from(String(text || ''))
}

export function EffectName({
  text = '',
  effect = 'clean',
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
    if (!root || effect === 'clean' || prefersReducedMotion()) return undefined

    const ctx = gsap.context(() => {
      if (FRACTURE_EFFECTS.has(effect)) {
        const nodes = root.querySelectorAll('.cz-effect-char')
        gsap.fromTo(nodes, {
          x: (index) => ((index % 2 ? 1 : -1) * (22 + (index % 5) * 8)),
          y: (index) => ((index % 3) - 1) * 20,
          rotation: (index) => (index % 2 ? 1 : -1) * (10 + (index % 4) * 10),
          scale: (index) => 0.35 + (index % 3) * 0.14,
          opacity: 0,
          filter: 'blur(6px)',
        }, {
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          opacity: 1,
          filter: 'blur(0px)',
          duration: effect === 'architect-core' ? 1.05 : 0.82,
          stagger: 0.038,
          ease: 'power4.out',
          overwrite: true,
        })
      }

      if (effect === 'kinetic') {
        const nodes = root.querySelectorAll('.cz-effect-char')
        tweenRef.current = gsap.to(nodes, {
          y: (index) => index % 2 ? -3.5 : 3.5,
          rotation: (index) => index % 2 ? 2.2 : -2.2,
          skewX: (index) => index % 2 ? 1.2 : -1.2,
          duration: 0.72,
          stagger: { each: 0.048, repeat: -1, yoyo: true },
          ease: 'sine.inOut',
        })
      }

      if (effect === 'architect-core') {
        gsap.to(root, {
          filter: 'drop-shadow(0 0 8px rgba(255,66,45,.72)) drop-shadow(0 0 18px rgba(255,174,39,.28))',
          duration: 1.45,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        })
      }

      if (effect === 'gsap-assemble') {
        const nodes = root.querySelectorAll('.cz-effect-char')
        const timeline = gsap.timeline({
          repeat: -1,
          repeatDelay: 0.65,
          yoyo: true,
        })

        gsap.set(nodes, {
          x: () => gsap.utils.random(-500, 500),
          y: () => gsap.utils.random(-500, 500),
          rotation: () => gsap.utils.random(-720, 720),
          scale: 0,
          opacity: 0,
        })

        timeline.to(nodes, {
          x: 0,
          y: 0,
          opacity: 1,
          scale: 1,
          rotation: 0,
          duration: 0.75,
          stagger: 0.0125,
          ease: 'power4.inOut',
        })

        tweenRef.current = timeline
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
      duration: 0.7,
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

  function handlePointerMove(event) {
    setPointerVars(event)

    if (effect === 'magnetic' && !prefersReducedMotion() && rootRef.current) {
      const root = rootRef.current
      const rect = root.getBoundingClientRect()
      const dx = (event.clientX - (rect.left + rect.width / 2)) / Math.max(rect.width, 1)
      const dy = (event.clientY - (rect.top + rect.height / 2)) / Math.max(rect.height, 1)
      gsap.to(root, {
        x: dx * 7,
        y: dy * 5,
        rotationY: dx * 5,
        rotationX: -dy * 4,
        duration: 0.25,
        ease: 'power2.out',
        overwrite: true,
      })
    }
  }

  function handlePointerLeave(event) {
    clearPointerVars(event)

    if (effect === 'gsap-assemble' && tweenRef.current && !prefersReducedMotion()) {
      tweenRef.current.timeScale(1)
    }

    if (effect === 'magnetic' && rootRef.current) {
      gsap.to(rootRef.current, {
        x: 0,
        y: 0,
        rotationX: 0,
        rotationY: 0,
        duration: 0.55,
        ease: 'elastic.out(1,.55)',
        overwrite: true,
      })
    }
  }

  function handlePointerEnter() {
    runScramble()

    if (effect === 'gsap-assemble' && tweenRef.current && !prefersReducedMotion()) {
      tweenRef.current.timeScale(0.15)
    }

    if (effect === 'fracture' && !prefersReducedMotion()) {
      const root = rootRef.current
      if (!root) return
      const nodes = root.querySelectorAll('.cz-effect-char')
      gsap.timeline({ defaults: { overwrite: true } })
        .to(nodes, {
          x: (index) => ((index % 2 ? 1 : -1) * (6 + (index % 4) * 2)),
          y: (index) => ((index % 3) - 1) * 6,
          rotation: (index) => (index % 2 ? 1 : -1) * 5,
          duration: 0.18,
          stagger: 0.012,
          ease: 'power2.out',
        })
        .to(nodes, {
          x: 0,
          y: 0,
          rotation: 0,
          duration: 0.5,
          stagger: 0.018,
          ease: 'elastic.out(1,.55)',
        })
    }
  }

  const appliedEffect = effect || 'clean'

  return (
    <Tag
      ref={rootRef}
      className={'cz-effect-name name-effect-' + appliedEffect + (className ? ' ' + className : '')}
      data-text={text}
      title={title}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerEnter={handlePointerEnter}
    >
      {effect === 'css-3d-glow'
        ? (
            <>
              <span className="cz-3d-glow-stack" aria-hidden="true">
                {Array.from({ length: 10 }, (_, index) => (
                  <span
                    className="cz-3d-glow-layer"
                    key={index}
                    style={{
                      '--layer-index': index,
                      '--layer-z': (index * 1.2) + 'px',
                      '--layer-offset': (index * 0.22) + 'px',
                    }}
                  >
                    {text}
                  </span>
                ))}
              </span>
              <span className="sr-only">{text}</span>
            </>
          )
        : needsChars
          ? chars.map((char, index) => (
              <span
                className="cz-effect-char"
                key={index + '-' + char}
                aria-hidden="true"
                style={{ '--char-index': index }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))
          : text}
      {needsChars && <span className="sr-only">{text}</span>}
    </Tag>
  )
}

// Retired visual layers remain as neutral compatibility wrappers so existing
// forum components keep their layout while badges, roles, avatars, covers and
// profile surfaces receive no cosmetic effect.
export function EffectBadge({ children, className = '', title }) {
  return <span className={className || undefined} title={title}>{children}</span>
}

export function EffectRole({ children, className = '', title }) {
  return <span className={className || undefined} title={title}>{children}</span>
}

export function EffectAvatarFrame({ children, className = '' }) {
  return <span className={className || undefined}>{children}</span>
}

export function EffectCoverFrame({ children, className = '' }) {
  return <div className={className || undefined}>{children}</div>
}

export function EffectSurface({ children, as = 'div', className = '' }) {
  const Tag = as
  return <Tag className={className || undefined}>{children}</Tag>
}

export function EffectPreview({
  kind,
  effect,
  name = 'CreativeZone',
}) {
  if (kind === 'name') {
    return <EffectName text={name} effect={effect} className="effect-preview-name" />
  }
  return <span>{name}</span>
}
