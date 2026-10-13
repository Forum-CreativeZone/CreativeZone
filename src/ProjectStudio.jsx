import React, { useEffect, useMemo, useState } from 'react'
import {
  Code2,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
  Workflow,
} from 'lucide-react'
import {
  commitProjectStudioFile,
  createProjectSecurityFix,
  createProjectStudioPullRequest,
  getProjectSecurityFixes,
  getProjectStudioCi,
  getProjectStudioStatus,
  getProjectStudioTree,
  readProjectStudioFile,
} from './services/githubStudioApi'

function StudioLocked({ plan }) {
  return (
    <section className="project-studio locked">
      <header><Code2/><span><small>CREATIVEZONE DEVHUB · ELITE</small><strong>Project Studio</strong></span><LockKeyhole/></header>
      <p>Edite arquivos, faça commits, abra Pull Requests, acompanhe CI/CD e use AutoFix sem sair do CreativeZone.</p>
      <small>Plano atual: {(plan?.plan_id || 'free').toUpperCase()} · disponível no ELITE.</small>
    </section>
  )
}

export function ProjectStudio({ project, canManage = false, notify }) {
  const [status,setStatus] = useState(null)
  const [loading,setLoading] = useState(false)
  const [tab,setTab] = useState('code')
  const [files,setFiles] = useState([])
  const [query,setQuery] = useState('')
  const [branch,setBranch] = useState('')
  const [baseBranch,setBaseBranch] = useState('')
  const [selected,setSelected] = useState('')
  const [content,setContent] = useState('')
  const [original,setOriginal] = useState('')
  const [message,setMessage] = useState('')
  const [commitInfo,setCommitInfo] = useState(null)
  const [ciRuns,setCiRuns] = useState([])
  const [fixes,setFixes] = useState([])
  const [busy,setBusy] = useState('')
  const [error,setError] = useState('')

  useEffect(()=>{
    let active=true
    if (!project?.id || !canManage) return undefined
    setLoading(true)
    getProjectStudioStatus(project.id)
      .then((result)=>{ if(active){ setStatus(result); setBaseBranch(result?.repository?.default_branch || 'main'); setBranch(result?.repository?.default_branch || 'main') }})
      .catch((next)=>active && setError(next?.message || 'Não foi possível abrir o Project Studio.'))
      .finally(()=>active && setLoading(false))
    return ()=>{active=false}
  },[project?.id,canManage])

  const visibleFiles = useMemo(()=>{
    const needle=query.trim().toLowerCase()
    return needle ? files.filter((item)=>String(item.path).toLowerCase().includes(needle)) : files
  },[files,query])

  if (!canManage) return null
  if (loading) return <section className="project-studio loading"><RefreshCw className="security-spin"/> Preparando Project Studio...</section>
  if (!status) return error ? <section className="project-studio locked"><p>{error}</p></section> : null
  if (!status.enabled) return <StudioLocked plan={status.plan}/>

  async function loadTree(nextBranch=branch || baseBranch) {
    setBusy('tree'); setError('')
    try {
      const result=await getProjectStudioTree(project.id,nextBranch)
      setFiles(result.files || [])
      setBranch(result.branch || nextBranch)
    } catch(next){setError(next?.message || 'Não foi possível listar os arquivos.')}
    finally{setBusy('')}
  }

  async function openFile(path) {
    setBusy('file'); setError('')
    try {
      const result=await readProjectStudioFile(project.id,path,branch || baseBranch)
      setSelected(result.path)
      setContent(result.content || '')
      setOriginal(result.content || '')
    } catch(next){setError(next?.message || 'Não foi possível abrir o arquivo.')}
    finally{setBusy('')}
  }

  async function commit() {
    if(!selected || content===original) return
    setBusy('commit'); setError('')
    try {
      const result=await commitProjectStudioFile(project.id,{
        path:selected,
        content,
        message:message || ('Update '+selected+' via CreativeZone'),
        branch:commitInfo?.branch || undefined,
      })
      setCommitInfo(result)
      setBranch(result.branch)
      setOriginal(content)
      setMessage('')
      notify?.('Commit criado no GitHub pelo CreativeZone.')
      await loadTree(result.branch)
    } catch(next){const msg=next?.message || 'Falha ao criar commit.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function createPr() {
    if(!commitInfo?.branch) return
    setBusy('pr');setError('')
    try{
      const result=await createProjectStudioPullRequest(project.id,{
        branch:commitInfo.branch,
        base_branch:commitInfo.base_branch || baseBranch,
        title:'CreativeZone: '+(message || selected || 'Project Studio changes'),
      })
      setCommitInfo((current)=>({...current,pull_request:result.pull_request}))
      notify?.('Pull Request criada no GitHub.')
    }catch(next){const msg=next?.message || 'Falha ao criar Pull Request.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function loadCi() {
    setBusy('ci');setError('')
    try{const result=await getProjectStudioCi(project.id,commitInfo?.branch || branch || baseBranch);setCiRuns(result.runs || [])}
    catch(next){setError(next?.message || 'Não foi possível carregar CI/CD.')}
    finally{setBusy('')}
  }

  async function loadFixes() {
    setBusy('fixes');setError('')
    try{const result=await getProjectSecurityFixes(project.id);setFixes(result.fixes || [])}
    catch(next){setError(next?.message || 'Não foi possível carregar correções.')}
    finally{setBusy('')}
  }

  async function autoFix(id) {
    setBusy('autofix:'+id);setError('')
    try{
      const result=await createProjectSecurityFix(project.id,id)
      notify?.('AutoFix criou uma Pull Request para revisão.')
      if(result.pull_request?.html_url) window.open(result.pull_request.html_url,'_blank','noopener,noreferrer')
    }catch(next){const msg=next?.message || 'Não foi possível criar a correção.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  return (
    <section className="project-studio">
      <header className="project-studio-head">
        <Code2/>
        <span><small>CREATIVEZONE DEVHUB · ELITE</small><strong>Project Studio</strong></span>
        <em><GitBranch/>{commitInfo?.branch || branch || baseBranch}</em>
      </header>
      <nav className="project-studio-tabs">
        <button className={tab==='code'?'active':''} onClick={()=>setTab('code')}><FileCode2/> Código</button>
        <button className={tab==='security'?'active':''} onClick={()=>{setTab('security');if(!fixes.length)loadFixes()}}><ShieldCheck/> AutoFix</button>
        <button className={tab==='ci'?'active':''} onClick={()=>{setTab('ci');loadCi()}}><Workflow/> CI/CD</button>
      </nav>

      {error && <p className="project-studio-error">{error}</p>}

      {tab==='code' && (
        <div className="project-studio-workspace">
          <aside>
            <div className="project-studio-search"><Search/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar arquivo"/></div>
            <button className="action studio-load" onClick={()=>loadTree()} disabled={busy==='tree'}><RefreshCw/>{files.length?'Atualizar':'Carregar arquivos'}</button>
            <div className="project-studio-files">
              {visibleFiles.map((item)=><button key={item.path} className={selected===item.path?'active':''} onClick={()=>openFile(item.path)}><FileCode2/>{item.path}</button>)}
            </div>
          </aside>
          <main>
            {selected ? (
              <>
                <div className="project-studio-filebar"><strong>{selected}</strong><span>{content===original?'Sem alterações':'Alterado'}</span></div>
                <textarea className="project-studio-editor" spellCheck="false" value={content} onChange={(e)=>setContent(e.target.value)}/>
                <div className="project-studio-commitbar">
                  <input value={message} onChange={(e)=>setMessage(e.target.value)} placeholder="Mensagem do commit"/>
                  <button className="action primary-action" onClick={commit} disabled={content===original || Boolean(busy)}><GitCommitHorizontal/>{busy==='commit'?'Commitando...':'Commitar no GitHub'}</button>
                  {commitInfo?.branch && !commitInfo?.pull_request && <button className="action" onClick={createPr} disabled={Boolean(busy)}><GitPullRequest/> Criar Pull Request</button>}
                  {commitInfo?.pull_request?.html_url && <a className="action" href={commitInfo.pull_request.html_url} target="_blank" rel="noreferrer"><GitPullRequest/> PR #{commitInfo.pull_request.number}<ExternalLink/></a>}
                </div>
              </>
            ) : <div className="project-studio-empty"><Code2/><strong>Selecione um arquivo</strong><p>As alterações são commitadas em uma branch CreativeZone e podem virar Pull Request sem sair do fórum.</p></div>}
          </main>
        </div>
      )}

      {tab==='security' && (
        <div className="project-studio-security">
          <header><span><ShieldCheck/><strong>AutoFix assistido</strong></span><button className="action" onClick={loadFixes}><RefreshCw/> Atualizar</button></header>
          {!fixes.length && !busy && <p>Nenhuma vulnerabilidade com versão corrigida disponível no último relatório.</p>}
          {fixes.map((item)=><article key={item.id}><span><b>{item.package_name}</b><small>{item.osv_id} · {item.severity} · {item.version} → {item.fixed_versions?.[0]}</small></span><button className="action" onClick={()=>autoFix(item.id)} disabled={Boolean(busy)}><Wrench/>{busy==='autofix:'+item.id?'Criando PR...':'Criar correção'}</button></article>)}
        </div>
      )}

      {tab==='ci' && (
        <div className="project-studio-ci">
          <header><span><Workflow/><strong>CI/CD Cockpit</strong></span><button className="action" onClick={loadCi}><RefreshCw/> Atualizar</button></header>
          {ciRuns.map((run)=><a key={run.id} href={run.html_url} target="_blank" rel="noreferrer"><span><b>{run.name}</b><small>{run.event} · {String(run.head_sha||'').slice(0,7)}</small></span><em className={'ci-'+(run.conclusion || run.status)}>{run.conclusion || run.status}</em><ExternalLink/></a>)}
          {!ciRuns.length && !busy && <p>Nenhuma execução encontrada nesta branch.</p>}
        </div>
      )}
    </section>
  )
}
