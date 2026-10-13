import React, { useEffect, useState } from 'react'
import {
  CircleDot,
  ExternalLink,
  Eye,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  Github,
  Languages,
  LockKeyhole,
  Package,
  RefreshCw,
  Rocket,
  Star,
  Workflow,
} from 'lucide-react'
import { getGitHubRepositoryCard, syncGitHubProject } from './services/githubApi'

function formatRelative(value) {
  if (!value) return '—'
  const diff = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  return `há ${days} dia${days === 1 ? '' : 's'}`
}

function topLanguages(languages = {}) {
  const rows = Object.entries(languages || {}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,6)
  const total = rows.reduce((sum,[,bytes])=>sum+Number(bytes || 0),0)
  return rows.map(([name,bytes])=>({ name, percent: total ? Math.round(Number(bytes)*100/total) : 0 }))
}

function PlanChip({ plan }) {
  const id = String(plan?.plan_id || 'free').toUpperCase()
  return <span className={'devhub-plan-chip plan-' + id.toLowerCase()}>{id === 'OWNER' ? 'ARQUITETO' : id}</span>
}

export function GitHubRepositoryPanel({ project, canManage = false, notify, onChanged }) {
  const [data,setData] = useState(null)
  const [loading,setLoading] = useState(Boolean(project?.repo_url))
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')

  async function load() {
    if (!project?.id || !project?.repo_url) return
    setLoading(true)
    setError('')
    try { setData(await getGitHubRepositoryCard(project.id)) }
    catch (nextError) { setError(nextError?.message || 'Não foi possível carregar o GitHub DevHub.') }
    finally { setLoading(false) }
  }

  useEffect(()=>{ load() },[project?.id,project?.repo_url])

  async function sync() {
    setBusy(true)
    setError('')
    try {
      const result = await syncGitHubProject(project.id)
      setData(result)
      notify?.('GitHub DevHub sincronizado.')
      onChanged?.()
    } catch (nextError) {
      const message = nextError?.message || 'Não foi possível sincronizar o repositório.'
      setError(message)
      notify?.(message)
    } finally { setBusy(false) }
  }

  if (!project?.repo_url) {
    return <section className="devhub-repository-panel is-empty"><header><Github /><span><small>CREATIVEZONE DEVHUB</small><strong>GitHub Repository Connect</strong></span></header><p>Adicione um repositório GitHub ao projeto para ativar cards, releases, segurança OSV e recursos DevHub.</p></section>
  }
  if (loading) return <section className="devhub-repository-panel is-loading"><Github/><span>Conectando ao GitHub DevHub...</span></section>

  const repository = data?.repository
  const plan = data?.plan || {}
  const capabilities = plan.capabilities || {}
  if (!repository) {
    return <section className="devhub-repository-panel is-empty">
      <header><Github /><span><small>CREATIVEZONE DEVHUB</small><strong>Repositório aguardando sincronização</strong></span></header>
      {error && <p className="devhub-error">{error}</p>}
      {canManage && <button className="action primary-action" type="button" onClick={sync} disabled={busy}><RefreshCw/>{busy?'Sincronizando...':'Sincronizar GitHub'}</button>}
    </section>
  }

  const langs = topLanguages(repository.languages)
  const actions = repository.actions_summary?.runs || []
  const issues = repository.issues_summary?.items || []
  const pulls = repository.pull_requests_summary?.items || []
  const releases = repository.metadata?.releases || []
  const release = repository.latest_release || {}
  const lastCommit = repository.last_commit || {}

  return <section className={'devhub-repository-panel ' + (repository.is_private ? 'is-private' : '')}>
    <header className="devhub-repo-head">
      <span className="devhub-repo-avatar">{repository.owner_avatar_url ? <img src={repository.owner_avatar_url} alt="" /> : <Github />}</span>
      <span className="devhub-repo-title"><small>CREATIVEZONE DEVHUB</small><strong>{repository.repo_owner}/{repository.repo_name}</strong><em>{repository.description || 'Repositório GitHub conectado ao projeto.'}</em></span>
      <PlanChip plan={plan}/>
      {repository.is_private && <span className="devhub-private"><LockKeyhole/> Privado</span>}
    </header>

    <div className="devhub-repo-metrics">
      <span><Star/><b>{repository.stargazers_count || 0}</b><small>Stars</small></span>
      <span><GitFork/><b>{repository.forks_count || 0}</b><small>Forks</small></span>
      <span><Eye/><b>{repository.watchers_count || 0}</b><small>Watchers</small></span>
      <span><CircleDot/><b>{repository.open_issues_count || 0}</b><small>Issues</small></span>
    </div>

    <div className="devhub-repo-meta">
      {repository.primary_language && <span><Languages/> {repository.primary_language}</span>}
      {repository.license_spdx && <span><Package/> {repository.license_spdx}</span>}
      {repository.default_branch && <span><GitBranch/> {repository.default_branch}</span>}
      {repository.last_sync_at && <span><RefreshCw/> sincronizado {formatRelative(repository.last_sync_at)}</span>}
    </div>

    {release?.tagName && <a className="devhub-release" href={release.url || repository.repo_url} target="_blank" rel="noreferrer"><Rocket/><span><small>Última release</small><strong>{release.tagName}</strong>{release.name && <em>{release.name}</em>}</span><ExternalLink/></a>}
    {langs.length > 0 && <div className="devhub-languages"><strong>Linguagens</strong><div>{langs.map(item=><span key={item.name}><b>{item.name}</b><small>{item.percent}%</small></span>)}</div></div>}
    {lastCommit?.oid && <div className="devhub-last-commit"><GitCommitHorizontal/><span><small>Último commit</small><strong>{lastCommit.messageHeadline || String(lastCommit.oid).slice(0,7)}</strong><em>{formatRelative(lastCommit.committedDate)}</em></span></div>}

    {(issues.length > 0 || pulls.length > 0 || actions.length > 0) && <div className="devhub-advanced-grid">
      {issues.length > 0 && <section><header><CircleDot/> Issues</header>{issues.slice(0,4).map(item=><a key={item.number} href={item.html_url} target="_blank" rel="noreferrer">#{item.number} {item.title}</a>)}</section>}
      {pulls.length > 0 && <section><header><GitPullRequest/> Pull Requests</header>{pulls.slice(0,4).map(item=><a key={item.number} href={item.html_url} target="_blank" rel="noreferrer">#{item.number} {item.title}</a>)}</section>}
      {actions.length > 0 && <section><header><Workflow/> GitHub Actions</header>{actions.slice(0,4).map(item=><a key={item.id} href={item.html_url} target="_blank" rel="noreferrer"><b>{item.name}</b><small>{item.conclusion || item.status}</small></a>)}</section>}
    </div>}

    {repository.readme_excerpt && <details className="devhub-readme"><summary>README do projeto</summary><pre>{repository.readme_excerpt}</pre></details>}
    {capabilities.release_history && releases.length > 1 && <details className="devhub-release-history"><summary>Histórico de releases ({releases.length})</summary><div>{releases.map(item=><a key={item.html_url || item.tag_name} href={item.html_url} target="_blank" rel="noreferrer"><b>{item.tag_name}</b><span>{item.name || 'Release'}</span></a>)}</div></details>}

    {error && <p className="devhub-error">{error}</p>}
    <footer>
      <a className="action" href={repository.repo_url} target="_blank" rel="noreferrer"><Github/> Abrir no GitHub <ExternalLink/></a>
      {canManage && <button className="action" type="button" onClick={sync} disabled={busy}><RefreshCw className={busy?'security-spin':''}/>{busy?'Sincronizando...':'Atualizar DevHub'}</button>}
      {String(plan.plan_id || '').toLowerCase() === 'free' && <small>PRO libera SBOM, deps.dev, commits, issues, PRs, Actions e histórico.</small>}
      {String(plan.plan_id || '').toLowerCase() === 'pro' && <small>ELITE libera repositórios privados, scans push/PR, Security Gate, AutoFix e Project Studio.</small>}
    </footer>
  </section>
}
