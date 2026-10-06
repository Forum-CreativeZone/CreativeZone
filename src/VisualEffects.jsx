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

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function ShaderLayer({ variant = 'cosmic' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (prefersReducedMotion()) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) return undefined

    const vertexSource = [
      'attribute vec2 a_position;',
      'void main(){',
      '  gl_Position = vec4(a_position, 0.0, 1.0);',
      '}',
    ].join('\n')

    const fragmentSource = [
      'precision mediump float;',
      'uniform vec2 u_resolution;',
      'uniform vec2 u_mouse;',
      'uniform float u_time;',
      'uniform float u_variant;',
      'float glowLine(float d, float w){ return smoothstep(w, 0.0, abs(d)); }',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0));',
      '  vec2 p = uv - 0.5;',
      '  p.x *= u_resolution.x / max(u_resolution.y, 1.0);',
      '  vec2 m = u_mouse - 0.5;',
      '  m.x *= u_resolution.x / max(u_resolution.y, 1.0);',
      '  float t = u_time * 0.00045;',
      '  float waveA = sin((p.x * 9.0 + p.y * 5.0) + t * 7.0) * 0.5 + 0.5;',
      '  float waveB = sin((p.x * -6.0 + p.y * 11.0) - t * 5.0) * 0.5 + 0.5;',
      '  float radial = 1.0 - smoothstep(0.0, 0.9, distance(p, m));',
      '  float scan = glowLine(fract((uv.y + t * 0.32) * 3.0) - 0.5, 0.028);',
      '  vec3 cosmic = mix(vec3(0.12,0.35,1.0), vec3(0.95,0.13,0.70), waveA);',
      '  cosmic = mix(cosmic, vec3(0.25,1.0,0.92), waveB * 0.35);',
      '  vec3 architect = mix(vec3(1.0,0.12,0.04), vec3(1.0,0.68,0.10), waveA);',
      '  architect = mix(architect, vec3(1.0,0.95,0.72), scan * 0.7);',
      '  vec3 color = mix(cosmic, architect, step(0.5, u_variant));',
      '  float alpha = (0.035 + radial * 0.12 + scan * 0.075) * (0.65 + waveB * 0.35);',
      '  gl_FragColor = vec4(color, alpha);',
      '}',
    ].join('\n')

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
    if (!vertex || !fragment) return undefined

    const program = gl.createProgram()
    if (!program) return undefined
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return undefined
    }

    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]),
      gl.STATIC_DRAW
    )
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const mouseLocation = gl.getUniformLocation(program, 'u_mouse')
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    const variantLocation = gl.getUniformLocation(program, 'u_variant')

    const host = canvas.parentElement
    let mouseX = 0.5
    let mouseY = 0.5
    let visible = true
    let raf = 0

    function resize() {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = Math.max(1, Math.round(rect.width * dpr))
      const height = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    function onPointerMove(event) {
      if (!host) return
      const rect = host.getBoundingClientRect()
      mouseX = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1)))
      mouseY = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1)))
    }

    const observer = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          visible = Boolean(entries[0]?.isIntersecting)
        }, { threshold: 0.05 })
      : null

    observer?.observe(canvas)
    host?.addEventListener('pointermove', onPointerMove, { passive: true })

    function render(time) {
      resize()
      if (visible) {
        gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
        gl.uniform2f(mouseLocation, mouseX, mouseY)
        gl.uniform1f(timeLocation, time)
        gl.uniform1f(variantLocation, variant === 'architect' ? 1 : 0)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      host?.removeEventListener('pointermove', onPointerMove)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [variant])

  return <canvas ref={canvasRef} className="cz-effect-shader" aria-hidden="true" />
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

  return (
    <Tag
      ref={rootRef}
      className={'cz-effect-name name-effect-' + effect + (className ? ' ' + className : '')}
      style={color ? { '--cz-name-color': color } : undefined}
      data-text={text}
      title={title}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerEnter={handlePointerEnter}
    >
      {needsChars
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
      {['orbit-badge','electric-badge','architect-forge','holo-chip-badge','living-border-badge'].includes(effect) && (
        <span className="cz-effect-badge-orbit" aria-hidden="true">
          <i /><i /><i />
        </span>
      )}
      {['holo-chip-badge','architect-forge'].includes(effect) && (
        <span className="cz-badge-circuit" aria-hidden="true"><i /><i /><i /></span>
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

export function EffectAvatarFrame({
  children,
  effect = 'avatar-clean',
  className = '',
  compact = false,
}) {
  return (
    <span
      className={
        'cz-avatar-effect avatar-effect-' + effect +
        (compact ? ' compact' : '') +
        (className ? ' ' + className : '')
      }
      data-effect={effect}
      onPointerMove={setPointerVars}
      onPointerLeave={clearPointerVars}
    >
      {children}
      <span className="cz-avatar-ring cz-avatar-ring-a" aria-hidden="true" />
      <span className="cz-avatar-ring cz-avatar-ring-b" aria-hidden="true" />
      <span className="cz-avatar-orbit" aria-hidden="true"><i /><i /><i /></span>
      <span className="cz-avatar-crown" aria-hidden="true"><i /><i /><i /></span>
    </span>
  )
}

export function EffectCoverFrame({
  children,
  effect = 'cover-clean',
  className = '',
}) {
  return (
    <div
      className={'cz-cover-effect cover-effect-v2-' + effect + (className ? ' ' + className : '')}
      data-effect={effect}
      onPointerMove={setPointerVars}
      onPointerLeave={clearPointerVars}
    >
      {children}
      <span className="cz-cover-overlay" aria-hidden="true" />
      <span className="cz-cover-scan" aria-hidden="true" />
      <span className="cz-cover-corners" aria-hidden="true"><i /><i /><i /><i /></span>
    </div>
  )
}

export function EffectSurface({
  children,
  effect = 'none',
  as = 'div',
  className = '',
  entrance = false,
  preview = false,
}) {
  const rootRef = useRef(null)
  const Tag = as

  useEffect(() => {
    const root = rootRef.current
    if (!root || !entrance || prefersReducedMotion()) return undefined

    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
      const cover = root.querySelector('.public-profile-cover')
      const avatar = root.querySelector('.public-avatar-frame')
      const main = root.querySelector('.public-profile-main')
      const badges = root.querySelectorAll('.profile-identity-badges > *')

      if (cover) {
        timeline.fromTo(cover, { opacity: 0.35, scale: 1.035 }, { opacity: 1, scale: 1, duration: 0.62 })
      }
      if (avatar) {
        timeline.fromTo(avatar, { opacity: 0, y: 18, scale: 0.76, rotation: -4 }, {
          opacity: 1, y: 0, scale: 1, rotation: 0, duration: 0.65, ease: 'back.out(1.7)',
        }, '-=0.34')
      }
      if (main) {
        timeline.fromTo(main.children, { opacity: 0, y: 10 }, {
          opacity: 1, y: 0, duration: 0.42, stagger: 0.045,
        }, '-=0.4')
      }
      if (badges.length) {
        timeline.fromTo(badges, { opacity: 0, scale: 0.82, y: 4 }, {
          opacity: 1, scale: 1, y: 0, duration: 0.32, stagger: 0.035,
        }, '-=0.25')
      }
    }, root)

    return () => ctx.revert()
  }, [entrance, effect])

  return (
    <Tag
      ref={rootRef}
      className={'cz-effect-surface profile-effect-' + effect + (entrance ? ' has-entrance' : '') + (className ? ' ' + className : '')}
      onPointerMove={setPointerVars}
      onPointerLeave={clearPointerVars}
    >
      {children}
      {!preview && effect === 'living-interface' && <ShaderLayer variant="cosmic" />}
      {!preview && effect === 'architect-grid' && <ShaderLayer variant="architect" />}
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
  if (kind === 'avatar') {
    return (
      <EffectAvatarFrame effect={effect} className="effect-preview-avatar">
        <span className="effect-preview-avatar-face">CZ</span>
      </EffectAvatarFrame>
    )
  }
  if (kind === 'cover') {
    return (
      <EffectCoverFrame effect={effect} className="effect-preview-cover">
        <span className="effect-preview-cover-label">CreativeZone</span>
      </EffectCoverFrame>
    )
  }
  return (
    <EffectSurface effect={effect} className="effect-preview-surface" preview>
      <span>CreativeZone</span>
      <small>Perfil VIP</small>
    </EffectSurface>
  )
}
