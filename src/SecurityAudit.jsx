import React, { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
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

function securityIconName(severity = 'none') {
  if (severity === 'critical' || severity === 'high') return 'solar:shield-warning-bold-duotone'
  if (severity === 'medium' || severity === 'low') return 'solar:danger-triangle-bold-duotone'
  if (severity === 'unknown') return 'solar:shield-keyhole-bold-duotone'
  return 'solar:shield-check-bold-duotone'
}

function SecurityIcon({ severity = 'none', width = 18 }) {
  return <Icon icon={securityIconName(severity)} width={width} height={width} />
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

  const vulnerabilities = findings.flatMap((finding) =>
    (finding.vulnerabilities || []).map((vulnerability) => ({
      ...vulnerability,
      package_name: finding.package_name,
      version: finding.version,
      ecosystem: finding.ecosystem,
    }))
  )
  const visible = open ? vulnerabilities : vulnerabilities.slice(0, 4)

  return (
    <div className="security-findings">
      <div className="security-findings-head">
        <span>
          <Icon icon="solar:bug-minimalistic-bold-duotone" width="18" />
          <strong>Vulnerabilidades encontradas</strong>
        </span>
        <small>{vulnerabilities.length} registro{vulnerabilities.length === 1 ? '' : 's'}</small>
      </div>

      <div className="security-advisory-list">
        {visible.map((vulnerability) => (
          <article className="security-advisory" key={vulnerability.id}>
            <span className={'security-advisory-icon severity-' + (vulnerability.severity || 'unknown')}>
              <Icon icon={securityIconName(vulnerability.severity || 'unknown')} width="18" />
            </span>

            <div className="security-advisory-main">
              <div className="security-advisory-heading">
                <span>
                  <strong>{vulnerability.id}</strong>
                  {vulnerability.aliases?.find((item) => /^CVE-/i.test(item)) && (
                    <code>{vulnerability.aliases.find((item) => /^CVE-/i.test(item))}</code>
                  )}
                </span>
                <b className={'security-severity severity-' + (vulnerability.severity || 'unknown')}>
                  {severityLabels[vulnerability.severity] || vulnerability.severity}
                </b>
              </div>

              <p>{vulnerability.summary || 'Vulnerabilidade conhecida nesta dependência.'}</p>

              <div className="security-advisory-meta">
                {vulnerability.fixed_versions?.length > 0 ? (
                  <span className="security-fixed-version">
                    <Icon icon="solar:check-circle-bold-duotone" width="15" />
                    Corrigida em {vulnerability.fixed_versions.join(', ')}
                  </span>
                ) : (
                  <span>
                    <Icon icon="solar:clock-circle-bold-duotone" width="15" />
                    Correção não informada
                  </span>
                )}
                <span>
                  <Icon icon="solar:box-bold-duotone" width="15" />
                  {vulnerability.package_name} {vulnerability.version}
                </span>
              </div>
            </div>

            {vulnerability.references?.[0] && (
              <a
                className="security-advisory-link"
                href={vulnerability.references[0]}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={'Abrir referência de ' + vulnerability.id}
                title="Abrir referência técnica"
              >
                <Icon icon="solar:arrow-right-up-linear" width="18" />
              </a>
            )}
          </article>
        ))}
      </div>

      {vulnerabilities.length > 4 && (
        <button type="button" className="security-show-more" onClick={() => setOpen((value) => !value)}>
          <Icon icon={open ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="16" />
          {open ? 'Mostrar menos' : 'Ver todas as ' + vulnerabilities.length + ' vulnerabilidades'}
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
      <div className="package-security-card security-report-state is-loading">
        <Icon icon="solar:refresh-circle-bold-duotone" width="24" />
        <span>
          <strong>Analisando dependência</strong>
          <small>{packageName} {version} · {ecosystem}</small>
        </span>
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="package-security-card security-report-state is-error">
        <Icon icon="solar:shield-warning-bold-duotone" width="24" />
        <span>
          <strong>Análise indisponível</strong>
          <small>{error || 'Tente novamente mais tarde.'}</small>
        </span>
      </div>
    )
  }

  const clean = Number(result.vulnerability_count || 0) === 0
  const severity = result.highest_severity || 'none'
  const score = Number(result.security_score ?? 0)

  return (
    <section className={'package-security-card security-report ' + (clean ? 'is-clean' : 'has-alerts')}>
      <header className="security-report-header">
        <div className="security-report-identity">
          <span className={'security-report-mark severity-' + severity}>
            <SecurityIcon severity={severity} width={24} />
          </span>
          <div>
            <small className="security-report-kicker">CREATIVEZONE SECURITY</small>
            <div className="security-report-title">
              <strong>{result.package_name}</strong>
              <code>{result.version}</code>
            </div>
            <span className="security-report-subtitle">
              <Icon icon="solar:box-bold-duotone" width="14" />
              {result.ecosystem}
            </span>
          </div>
        </div>

        <div className={'security-report-score severity-' + severity}>
          <span>Security score</span>
          <strong>{score}</strong>
          <small>/100</small>
        </div>
      </header>

      <div className={'security-report-verdict ' + (clean ? 'is-clean' : 'has-alerts')}>
        <span>
          <Icon
            icon={clean ? 'solar:check-circle-bold-duotone' : 'solar:danger-triangle-bold-duotone'}
            width="20"
          />
        </span>
        <div>
          <strong>
            {clean
              ? 'Nenhuma vulnerabilidade conhecida encontrada'
              : result.vulnerability_count + ' vulnerabilidade' + (result.vulnerability_count === 1 ? '' : 's') + ' conhecida' + (result.vulnerability_count === 1 ? '' : 's')}
          </strong>
          <small>
            Resultado para {result.package_name} {result.version} em {result.ecosystem}.
          </small>
        </div>
        <time dateTime={result.checked_at || undefined}>
          <Icon icon="solar:clock-circle-linear" width="14" />
          {formatDate(result.checked_at)}
        </time>
      </div>

      <div className="security-report-metrics" aria-label="Resumo de severidade">
        <span className="metric-total">
          <Icon icon="solar:bug-bold-duotone" width="18" />
          <b>{result.vulnerability_count || 0}</b>
          <small>Total</small>
        </span>
        <span className="metric-critical">
          <i />
          <b>{result.critical_count || 0}</b>
          <small>Críticas</small>
        </span>
        <span className="metric-high">
          <i />
          <b>{result.high_count || 0}</b>
          <small>Altas</small>
        </span>
        <span className="metric-medium">
          <i />
          <b>{result.medium_count || 0}</b>
          <small>Moderadas</small>
        </span>
        <span className="metric-low">
          <i />
          <b>{result.low_count || 0}</b>
          <small>Baixas</small>
        </span>
      </div>

      <FindingList findings={result.findings || []} />

      <footer className="security-report-footer">
        <span>
          <Icon icon="solar:info-circle-linear" width="15" />
          A análise cobre vulnerabilidades conhecidas publicamente para esta dependência e versão.
        </span>
        <small>Ausência de alertas não é garantia absoluta de segurança.</small>
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
