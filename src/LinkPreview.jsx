import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Link2, LoaderCircle, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import { normalizePreviewUrl, resolveLinkPreview } from './services/linkPreviewApi'

function domainFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return 'Link externo'
  }
}

function formattedDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date)
}

export function LinkPreviewCard({
  url,
  variant = 'full',
  className = '',
  eager = false,
}) {
  const normalized = useMemo(() => normalizePreviewUrl(url), [url])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(Boolean(eager))
  const [imageFailed, setImageFailed] = useState(false)
  const root = useRef(null)

  useEffect(() => {
    setPreview(null)
    setImageFailed(false)
  }, [normalized])

  useEffect(() => {
    if (!normalized || ready) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setReady(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setReady(true)
          observer.disconnect()
        }
      },
      { rootMargin: '420px 0px' }
    )

    if (root.current) observer.observe(root.current)
    return () => observer.disconnect()
  }, [normalized, ready])

  useEffect(() => {
    let active = true
    if (!normalized || !ready) return undefined

    setLoading(true)
    resolveLinkPreview(normalized)
      .then((next) => {
        if (active) setPreview(next)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [normalized, ready])

  if (!normalized) return null

  const fallbackDomain = domainFromUrl(normalized)
  const target = preview?.url || normalized
  const domain = preview?.domain || fallbackDomain
  const title = preview?.title || preview?.publisher || domain
  const description = preview?.description || ''
  const publisher = preview?.publisher || domain
  const date = formattedDate(preview?.published_at)
  const author = String(preview?.author || '').trim()
  const lang = String(preview?.lang || '').trim()
  const detailed = variant !== 'compact' && variant !== 'minimal'
  const showImage = Boolean(preview?.image_url && !imageFailed && variant !== 'minimal')
  const hasMetadata = Boolean(preview && preview.status !== 'failed' && preview.status !== 'blocked')
  const safety = preview?.safety || null
  const shielded = Boolean(safety && (safety.decision === 'warn' || safety.decision === 'block'))
  const verified = Boolean(
    safety?.protected &&
    safety?.decision === 'allow' &&
    safety?.verdict === 'no_known_threat'
  )

  if (shielded) {
    return (
      <div ref={root} className={'cz-link-preview is-shielded ' + (safety.decision === 'block' ? 'is-blocked' : 'is-warning')}>
        <a href={target} target="_blank" rel="noreferrer noopener" className="cz-link-preview-anchor" title={'Abrir ' + domain}>
          <span className="cz-link-preview-shield-warning">
            {safety.decision === 'block' ? <ShieldAlert /> : <TriangleAlert />}
            <span>
              <small>CREATIVEZONE LINK SHIELD</small>
              <strong>{safety.decision === 'block' ? 'Link potencialmente perigoso' : 'Link requer atenção'}</strong>
              <em>{safety.verdict === 'malicious'
                ? 'A URL foi associada à distribuição de malware por uma fonte de reputação configurada.'
                : 'A prévia remota foi bloqueada preventivamente até você decidir se deseja abrir o endereço.'}</em>
              <em>{domain}</em>
            </span>
          </span>
        </a>
      </div>
    )
  }

  return (
    <div
      ref={root}
      className={[
        'cz-link-preview',
        'cz-link-preview-' + variant,
        hasMetadata ? 'is-resolved' : 'is-fallback',
        showImage ? 'has-media' : 'no-media',
        loading ? 'is-loading' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <a
        href={target}
        target="_blank"
        rel="noreferrer noopener"
        className="cz-link-preview-anchor"
        title={'Abrir ' + domain}
      >
        {showImage && (
          <span className="cz-link-preview-media">
            <img
              src={preview.image_url}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          </span>
        )}

        <span className="cz-link-preview-content">
          <span className="cz-link-preview-source">
            {preview?.logo_url ? (
              <img
                src={preview.logo_url}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <Link2 />
            )}
            <span>{publisher}</span>
            {verified && (
              <small
                className="cz-link-preview-shield-ok"
                title="CreativeZone Link Shield: nenhuma ameaça conhecida nas fontes consultadas"
              >
                <ShieldCheck />
                {variant === 'compact' ? 'Verificado' : 'Link Shield · sem ameaça conhecida'}
              </small>
            )}
            {variant === 'compact' && date && <small>{date}</small>}
          </span>

          {detailed && <small className="cz-link-preview-kicker">{variant==='project'?'SITE DO PROJETO':'PRÉVIA DO LINK'}</small>}
          <strong className="cz-link-preview-title">{title}</strong>
          {description && variant !== 'compact' && (
            <span className="cz-link-preview-description">{description}</span>
          )}

          {detailed ? (
            <span className="cz-link-preview-meta">
              <small>{domain}</small>
              {author && <small>Por {author}</small>}
              {date && <small>{date}</small>}
              {lang && <small>{lang.replace('_', '-')}</small>}
            </span>
          ) : (
            <small className="cz-link-preview-domain">{domain}</small>
          )}

          {detailed && (
            <span className="cz-link-preview-cta">
              Abrir site <ExternalLink />
            </span>
          )}
        </span>

        <span className="cz-link-preview-open" aria-hidden="true">
          {loading && !preview ? <LoaderCircle className="cz-link-preview-spinner" /> : <ExternalLink />}
        </span>
      </a>
    </div>
  )
}
