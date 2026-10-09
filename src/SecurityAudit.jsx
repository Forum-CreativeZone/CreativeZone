import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  GitBranch,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from 'lucide-react'
import {
  checkPackageSecurity,
  getProjectSecurityAudit,
  getProjectSecurityState,
  requestProjectSecurityAudit,
} from './services/securityApi'

const severityOrder = ['none', 'unknown', 'low', 'medium', 'high', 'critical']

const severityLabels = {
  none: 'Nenhuma',
  unknown: 'Não classificada',
  low: 'Baixa',
  medium: 'Moderada',
  high: 'Alta',
  critical: 'Crítica',
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function SecurityIcon({ severity = 'none' }) {
  if (severity === 'critical' || severity === 'high') return <ShieldAlert />
  if (severity === 'medium' || severity === 'low') return <AlertTriangle />
  if (severity === 'unknown') return <ShieldQuestion />
  return <ShieldCheck />
}

export function SecurityScoreBadge({ state, compact = false }) {
  if (!state?.last_audited_at) {
    return (
      <span className={'security-score-badge is-unknown ' + (compact ? 'compact' : '')}>
        <ShieldQuestion /> Não auditado
      </span>
    )
  }
  return (
    <span
      className={
        'security-score-badge severity-' +
        (state.highest_severity || 'none') +
        ' ' +
        (compact ? 'compact' : '')
      }
      title={'Última auditoria: ' + formatDate(state.last_audited_at)}
    >
      <SecurityIcon severity={state.highest_severity || 'none'} />
      {state.security_score}/100
    </span>
  )
}

function FindingList({ findings = [] }) {
  const [open, setOpen] = useState(false)
  if (!findings.length) return null
  const visible = open ? findings : findings.slice(0, 6)

  return (
    <div className="security-findings">
      {visible.map((finding, index) => (
        <article className="security-finding" key={(finding.package_name || 'pkg') + '-' + index}>
          <header>
            <span>
              <strong>{finding.package_name}</strong>
              <code>{finding.version}</code>
              <small>{finding.ecosystem}</small>
            </span>
            <b className={'security-severity severity-' + (finding.highest_severity || 'unknown')}>
              {severityLabels[finding.highest_severity] || finding.highest_severity}
            </b>
          </header>
          <div>
            {(finding.vulnerabilities || []).slice(0, 5).map((vulnerability) => (
              <section key={vulnerability.id}>
                <span>
                  <b>{vulnerability.id}</b>
                  <small>{vulnerability.summary}</small>
                </span>
                <span className={'security-severity severity-' + (vulnerability.severity || 'unknown')}>
                  {severityLabels[vulnerability.severity] || vulnerability.severity}
                </span>
                {vulnerability.fixed_versions?.length > 0 && (
                  <em>Correção conhecida: {vulnerability.fixed_versions.join(', ')}</em>
                )}
                {vulnerability.references?.[0] && (
                  <a href={vulnerability.references[0]} target="_blank" rel="noreferrer noopener">
                    Referência <ExternalLink />
                  </a>
                )}
              </section>
            ))}
          </div>
        </article>
      ))}
      {findings.length > 6 && (
        <button type="button" className="action security-show-more" onClick={() => setOpen((value) => !value)}>
          <ChevronDown className={open ? 'is-open' : ''} />
          {open ? 'Mostrar menos' : 'Ver todos os pacotes vulneráveis (' + findings.length + ')'}
        </button>
      )}
    </div>
  )
}

export function PackageSecurityCard({ ecosystem, packageName, version }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    checkPackageSecurity({ ecosystem, packageName, version })
      .then((next) => {
        if (active) setResult(next)
      })
      .catch((nextError) => {
        if (active) setError(nextError?.message || 'Não foi possível analisar este pacote.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [ecosystem, packageName, version])

  if (loading) {
    return (
      <div className="package-security-card is-loading">
        <RefreshCw />
        <span><strong>Analisando dependência...</strong><small>{packageName} {version}</small></span>
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="package-security-card is-error">
        <ShieldQuestion />
        <span><strong>Análise indisponível</strong><small>{error || 'Tente novamente mais tarde.'}</small></span>
      </div>
    )
  }

  const clean = Number(result.vulnerability_count || 0) === 0
  return (
    <section className={'package-security-card ' + (clean ? 'is-clean' : 'has-alerts')}>
      <header>
        <span className={'package-security-icon severity-' + (result.highest_severity || 'none')}>
          <SecurityIcon severity={result.highest_severity || 'none'} />
        </span>
        <span>
          <small>CREATIVEZONE SECURITY</small>
          <strong>{result.package_name} <code>{result.version}</code></strong>
          <em>{result.ecosystem}</em>
        </span>
        <SecurityScoreBadge
          state={{
            security_score: result.security_score,
            highest_severity: result.highest_severity,
            last_audited_at: result.checked_at,
          }}
          compact
        />
      </header>

      <div className="package-security-summary">
        {clean ? (
          <p><CheckCircle2 /> Nenhuma vulnerabilidade conhecida foi encontrada para esta versão.</p>
        ) : (
          <p><AlertTriangle /> {result.vulnerability_count} vulnerabilidade{result.vulnerability_count === 1 ? '' : 's'} conhecida{result.vulnerability_count === 1 ? '' : 's'} encontrada{result.vulnerability_count === 1 ? '' : 's'}.</p>
        )}
        <span>
          <b>{result.critical_count || 0}<small>Críticas</small></b>
          <b>{result.high_count || 0}<small>Altas</small></b>
          <b>{result.medium_count || 0}<small>Moderadas</small></b>
          <b>{result.low_count || 0}<small>Baixas</small></b>
        </span>
      </div>

      <FindingList findings={result.findings || []} />
      <footer>
        <small>Verificado em {formatDate(result.checked_at)} · ausência de alertas conhecidos não garante segurança absoluta.</small>
      </footer>
    </section>
  )
}

export function ProjectSecurityPanel({ project, canManage = false, notify, onChanged }) {
  const [state, setState] = useState(project?.project_security_state || null)
  const [audit, setAudit] = useState(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    if (!project?.id) return
    const [nextState, nextAudit] = await Promise.all([
      getProjectSecurityState(project.id),
      getProjectSecurityAudit(project.id),
    ])
    setState(nextState)
    setAudit(nextAudit)
  }

  useEffect(() => {
    let active = true
    if (!project?.id || !project?.repo_url) return undefined

    Promise.all([
      getProjectSecurityState(project.id),
      getProjectSecurityAudit(project.id),
    ]).then(([nextState, nextAudit]) => {
      if (!active) return
      setState(nextState)
      setAudit(nextAudit)
    }).catch(() => {})

    return () => { active = false }
  }, [project?.id, project?.repo_url])

  const due = useMemo(() => {
    if (!project?.repo_url) return false
    if (!state?.last_audited_at) return true
    return !state?.next_scan_at || new Date(state.next_scan_at).getTime() <= Date.now()
  }, [project?.repo_url, state?.last_audited_at, state?.next_scan_at])

  useEffect(() => {
    if (!canManage || !due || busy || !project?.repo_url) return
    let cancelled = false
    setBusy(true)
    requestProjectSecurityAudit(project.id, { force: false, triggerType: 'automatic' })
      .then(() => refresh())
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => { cancelled = true }
  }, [project?.id, project?.repo_url, canManage, due])

  if (!project?.repo_url) {
    return (
      <section className="project-security-panel is-empty">
        <header><ShieldQuestion /><span><small>CREATIVEZONE SECURITY</small><strong>Auditoria automática</strong></span></header>
        <p>Adicione um repositório GitHub ao projeto para analisar automaticamente manifests, dependências e vulnerabilidades conhecidas.</p>
      </section>
    )
  }

  async function auditNow() {
    setBusy(true)
    try {
      await requestProjectSecurityAudit(project.id, { force: true, triggerType: 'manual' })
      await refresh()
      onChanged?.()
      notify?.('Auditoria de segurança concluída.')
    } catch (error) {
      notify?.(error?.message || 'Não foi possível concluir a auditoria.')
    } finally {
      setBusy(false)
    }
  }

  const manifests = audit?.manifest_files || state?.summary?.manifest_files || []
  const findings = audit?.findings || []
  const statusText = state?.status === 'secure'
    ? 'Sem vulnerabilidades conhecidas'
    : state?.status === 'danger'
      ? 'Ação recomendada'
      : state?.status === 'attention'
        ? 'Requer atenção'
        : state?.status === 'scanning'
          ? 'Analisando repositório'
          : state?.status === 'error'
            ? 'Falha na última auditoria'
            : 'Aguardando primeira auditoria'

  return (
    <section className={'project-security-panel status-' + (state?.status || 'unknown')}>
      <header>
        <span className="project-security-main-icon">
          <SecurityIcon severity={state?.highest_severity || 'unknown'} />
        </span>
        <span>
          <small>CREATIVEZONE SECURITY</small>
          <strong>Auditoria automática do repositório</strong>
          <em>{statusText}</em>
        </span>
        <SecurityScoreBadge state={state} />
      </header>

      <div className="project-security-metrics">
        <span><b>{state?.dependency_count || 0}</b><small>Dependências</small></span>
        <span><b>{state?.manifest_count || 0}</b><small>Manifests</small></span>
        <span><b>{state?.vulnerable_dependency_count || 0}</b><small>Pacotes afetados</small></span>
        <span><b>{state?.vulnerability_count || 0}</b><small>Vulnerabilidades</small></span>
      </div>

      <div className="project-security-severity-grid">
        <span className="severity-critical"><b>{state?.critical_count || 0}</b>Críticas</span>
        <span className="severity-high"><b>{state?.high_count || 0}</b>Altas</span>
        <span className="severity-medium"><b>{state?.medium_count || 0}</b>Moderadas</span>
        <span className="severity-low"><b>{state?.low_count || 0}</b>Baixas</span>
      </div>

      {audit?.summary?.source && (
        <div className="project-security-source">
          <GitBranch />
          <span>
            <strong>{audit.repo_owner}/{audit.repo_name}</strong>
            <small>
              {audit.default_branch || 'branch padrão'}
              {' · '}
              {audit.source === 'github-sbom' ? 'dependências pelo grafo GitHub' : 'leitura direta de manifests'}
            </small>
          </span>
        </div>
      )}

      {Array.isArray(manifests) && manifests.length > 0 && (
        <details className="project-security-manifests">
          <summary>Manifests detectados ({manifests.length})</summary>
          <div>{manifests.map((path) => <code key={path}>{path}</code>)}</div>
        </details>
      )}

      <FindingList findings={findings} />

      <footer>
        <span>Última auditoria: {formatDate(state?.last_audited_at)}</span>
        {canManage && (
          <button className="action" type="button" onClick={auditNow} disabled={busy}>
            <RefreshCw className={busy ? 'security-spin' : ''} />
            {busy ? 'Auditando...' : 'Reanalisar agora'}
          </button>
        )}
      </footer>
    </section>
  )
}
