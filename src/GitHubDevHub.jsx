import React, { useEffect, useState } from 'react'
import {
  CircleDot,
  ExternalLink,
  Eye,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  Code2,
  Languages,
  LockKeyhole,
  Package,
  RefreshCw,
  Rocket,
  Star,
  Workflow,
  Users,
  UserPlus,
  Clock3,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import {
  getGitHubRepositoryCard,
  syncGitHubProject,
  getGitHubCommunityOrganization,
  requestGitHubOrganizationMembership,
  reviewGitHubOrganizationMembership,
} from './services/githubApi'

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
    return <section className="devhub-repository-panel is-empty"><header><Code2 /><span><small>CREATIVEZONE DEVHUB</small><strong>GitHub Repository Connect</strong></span></header><p>Adicione um repositório GitHub ao projeto para ativar cards, releases, segurança OSV e recursos DevHub.</p></section>
  }
  if (loading) return <section className="devhub-repository-panel is-loading"><Code2/><span>Conectando ao GitHub DevHub...</span></section>

  const repository = data?.repository
  const plan = data?.plan || {}
  const capabilities = plan.capabilities || {}
  if (!repository) {
    return <section className="devhub-repository-panel is-empty">
      <header><Code2 /><span><small>CREATIVEZONE DEVHUB</small><strong>Repositório aguardando sincronização</strong></span></header>
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
      <span className="devhub-repo-avatar">{repository.owner_avatar_url ? <img src={repository.owner_avatar_url} alt="" /> : <Code2 />}</span>
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
      <a className="action" href={repository.repo_url} target="_blank" rel="noreferrer"><Code2/> Abrir no GitHub <ExternalLink/></a>
      {canManage && <button className="action" type="button" onClick={sync} disabled={busy}><RefreshCw className={busy?'security-spin':''}/>{busy?'Sincronizando...':'Atualizar DevHub'}</button>}
      {String(plan.plan_id || '').toLowerCase() === 'free' && <small>PRO libera SBOM, deps.dev, commits, issues, PRs, Actions e histórico.</small>}
      {String(plan.plan_id || '').toLowerCase() === 'pro' && <small>ELITE libera repositórios privados, scans push/PR, Security Gate, AutoFix e Project Studio.</small>}
    </footer>
  </section>
}


export function GitHubCommunityOrganization({ session, navigate, notify }) {
  const [data,setData] = useState(null)
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [githubUsername,setGithubUsername] = useState('')
  const [message,setMessage] = useState('')

  async function load() {
    setLoading(true)
    try {
      setData(await getGitHubCommunityOrganization())
    } catch (error) {
      notify?.(error?.message || 'Não foi possível carregar a organização CreativeZone no GitHub.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ load() },[session?.user?.id])

  async function submit(event) {
    event.preventDefault()
    if (!session?.user) return navigate?.('/entrar')
    if (!githubUsername.trim()) return notify?.('Informe seu usuário do GitHub.')
    setBusy(true)
    try {
      await requestGitHubOrganizationMembership(githubUsername.trim(),message.trim())
      notify?.('Pedido enviado para a organização CreativeZone.')
      setMessage('')
      await load()
    } catch (error) {
      notify?.(error?.message || 'Não foi possível enviar o pedido.')
    } finally {
      setBusy(false)
    }
  }

  async function review(requestId,status) {
    setBusy(true)
    try {
      await reviewGitHubOrganizationMembership(requestId,status)
      notify?.(status === 'invited'
        ? 'Pedido marcado como convite enviado.'
        : 'Pedido recusado.')
      await load()
    } catch (error) {
      notify?.(error?.message || 'Não foi possível revisar o pedido.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <section className="github-community-hub is-loading"><RefreshCw className="security-spin"/><span>Carregando organização CreativeZone...</span></section>
  }

  const org=data?.organization
  if (!org) return null
  const repos=data?.repositories || []
  const request=data?.request
  const pending=data?.staff_requests || []

  return (
    <section className="github-community-hub">
      <header className="github-community-head">
        <span className="github-community-avatar">
          {org.avatar_url ? <img src={org.avatar_url} alt="" /> : <Code2 />}
        </span>
        <div>
          <small>ORGANIZAÇÃO OFICIAL NO GITHUB</small>
          <h2>{org.name || 'CreativeZone'}</h2>
          <strong>@{org.login}</strong>
          <p>{org.description || 'Projetos abertos, colaboração técnica e código criado pela comunidade CreativeZone.'}</p>
        </div>
        <a className="action" href={org.html_url} target="_blank" rel="noreferrer">
          <Code2/> Abrir organização <ExternalLink/>
        </a>
      </header>

      <div className="github-community-metrics">
        <span><Code2/><b>{org.public_repos || repos.length}</b><small>repositórios públicos</small></span>
        <span><Users/><b>{org.followers || 0}</b><small>seguidores</small></span>
        <span><GitBranch/><b>{repos.length}</b><small>projetos em destaque</small></span>
      </div>

      <div className="github-community-purpose">
        <article><strong>Crie projetos reais</strong><p>Comece o projeto no fórum, reúna colaboradores e conecte o repositório ao CreativeZone DevHub.</p></article>
        <article><strong>Trabalhe em equipe</strong><p>Use Issues, Pull Requests, branches, revisões, releases e o Project Studio conforme o plano.</p></article>
        <article><strong>Segurança integrada</strong><p>Dependências e vulnerabilidades podem ser analisadas por OSV, com histórico e automações nos planos compatíveis.</p></article>
      </div>

      {repos.length > 0 && (
        <div className="github-community-repos">
          <div className="github-community-section-title"><strong>Repositórios públicos da organização</strong><small>Visíveis para toda a comunidade</small></div>
          <div>
            {repos.slice(0,6).map(repo=>(
              <a key={repo.id || repo.full_name} href={repo.html_url} target="_blank" rel="noreferrer">
                <Code2/>
                <span><strong>{repo.name}</strong><small>{repo.description || 'Projeto CreativeZone no GitHub'}</small></span>
                {repo.language && <em>{repo.language}</em>}
                <ExternalLink/>
              </a>
            ))}
          </div>
        </div>
      )}

      <section className="github-community-join">
        <div>
          <small>PARTICIPE DA ORGANIZAÇÃO</small>
          <h3>Quer colaborar diretamente no GitHub?</h3>
          <p>Envie seu pedido pelo próprio fórum. A equipe recebe a solicitação dentro da CreativeZone e também por e-mail.</p>
        </div>

        {!session?.user ? (
          <button className="action primary-action" onClick={()=>navigate?.('/entrar')}><UserPlus/> Entrar para solicitar participação</button>
        ) : request?.status === 'pending' ? (
          <div className="github-community-request-state pending"><Clock3/><span><strong>Pedido em análise</strong><small>@{request.github_username} · enviado {formatRelative(request.created_at)}</small></span></div>
        ) : request?.status === 'invited' ? (
          <div className="github-community-request-state invited"><CheckCircle2/><span><strong>Convite sinalizado como enviado</strong><small>Verifique as notificações da sua conta GitHub e aceite o convite da organização.</small></span></div>
        ) : (
          <form onSubmit={submit}>
            {request?.status === 'declined' && <p className="github-community-request-state declined"><XCircle/> Seu pedido anterior foi recusado. Você pode enviar um novo pedido com mais contexto.</p>}
            <label>Seu usuário no GitHub
              <input value={githubUsername} onChange={e=>setGithubUsername(e.target.value)} placeholder="seu-usuario" maxLength={39} required />
            </label>
            <label>Como você pretende contribuir?
              <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ex.: frontend, backend, design, documentação, testes..." maxLength={1000}/>
            </label>
            <button className="action primary-action" disabled={busy}><UserPlus/>{busy?'Enviando...':'Solicitar participação'}</button>
          </form>
        )}
      </section>

      {data?.is_staff && pending.length > 0 && (
        <section className="github-community-admin">
          <div className="github-community-section-title"><strong>Pedidos pendentes</strong><small>{pending.length} aguardando revisão</small></div>
          {pending.map(item=>(
            <article key={item.id}>
              <span><strong>{item.profile?.display_name || item.profile?.username || 'Membro'}</strong><a href={'https://github.com/'+encodeURIComponent(item.github_username)} target="_blank" rel="noreferrer">@{item.github_username} <ExternalLink/></a><small>{item.message || 'Sem mensagem adicional.'}</small></span>
              <div>
                <button className="action" disabled={busy} onClick={()=>review(item.id,'invited')}><CheckCircle2/> Marcar convite enviado</button>
                <button className="action danger-action" disabled={busy} onClick={()=>review(item.id,'declined')}><XCircle/> Recusar</button>
              </div>
            </article>
          ))}
          <p className="github-community-admin-note">O botão “Marcar convite enviado” registra a revisão no fórum. O convite de membro continua sendo enviado pela organização no GitHub.</p>
        </section>
      )}
    </section>
  )
}
