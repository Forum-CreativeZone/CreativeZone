import React,{useEffect,useMemo,useState} from 'react'
import {
  BookOpen,ChevronDown,ChevronRight,CircleDot,Code2,ExternalLink,File,
  FileCode2,Folder,GitBranch,GitCommitHorizontal,GitFork,Globe2,
  Languages,LockKeyhole,Package,RefreshCw,Star,Users,X,
} from 'lucide-react'
import {getGitHubRenderedReadme,getGitHubRepositoryBrowser} from './services/githubApi'
import './ProjectRepositoryOverview.css'

function relative(value,language='pt'){
  if(!value) return '—'
  const diff=Math.max(0,Date.now()-new Date(value).getTime())
  const minutes=Math.floor(diff/60000)
  if(minutes<1) return language==='pt'?'agora':'now'
  if(minutes<60) return language==='pt'?'há '+minutes+' min':minutes+' min ago'
  const hours=Math.floor(minutes/60)
  if(hours<24) return language==='pt'?'há '+hours+' h':hours+'h ago'
  const days=Math.floor(hours/24)
  return language==='pt'?'há '+days+' dia'+(days===1?'':'s'):days+' day'+(days===1?'':'s')+' ago'
}
function languageRows(languages={}){
  const rows=Object.entries(languages||{}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,6)
  const total=rows.reduce((sum,[,bytes])=>sum+Number(bytes||0),0)
  return rows.map(([name,bytes])=>({name,percent:total?Math.round(Number(bytes||0)*100/total):0}))
}
function FileIcon({name,type}){
  if(type==='dir') return <Folder/>
  if(/\.(js|jsx|ts|tsx|json|html|css|sql|md|yml|yaml|toml|py|go|rs|java|c|cpp|h)$/i.test(name)) return <FileCode2/>
  return <File/>
}

export function ProjectRepositoryOverview({project,language='pt',onNavigate,notify}){
  const [browser,setBrowser]=useState(null)
  const [path,setPath]=useState('')
  const [loading,setLoading]=useState(true)
  const [readmeOpen,setReadmeOpen]=useState(false)
  const [readme,setReadme]=useState(null)
  const [readmeLoading,setReadmeLoading]=useState(false)

  async function load(nextPath=path){
    if(!project?.id) return
    setLoading(true)
    try{
      const data=await getGitHubRepositoryBrowser(project.id,nextPath,'')
      setBrowser(data)
      setPath(data?.path||nextPath||'')
    }catch(error){
      notify?.(error?.message||(language==='pt'?'Não foi possível carregar o repositório.':'Could not load repository.'))
    }finally{setLoading(false)}
  }

  useEffect(()=>{setPath('');setReadmeOpen(false);setReadme(null);load('')},[project?.id])

  async function toggleReadme(){
    const next=!readmeOpen
    setReadmeOpen(next)
    if(next&&!readme){
      setReadmeLoading(true)
      try{setReadme(await getGitHubRenderedReadme(project.id))}
      catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível carregar o README.':'Could not load README.'))}
      finally{setReadmeLoading(false)}
    }
  }

  const repository=browser?.repository||null
  const items=browser?.items||[]
  const commit=browser?.latest_commit||{}
  const languages=useMemo(()=>languageRows(repository?.languages),[repository?.languages])
  const labels=language==='pt'?{
    loading:'Carregando repositório real do GitHub...',
    noRepo:'Nenhum repositório GitHub conectado a este projeto.',
    branch:'Branch',
    latest:'Último commit',
    code:'Código',
    about:'Sobre',
    readme:'README',
    activity:'Atividade',
    issues:'Issues',
    releases:'Releases',
    languages:'Linguagens',
    openGithub:'Abrir no GitHub',
    openCode:'Abrir no Code Studio',
    root:'raiz',
    parent:'Voltar uma pasta',
    expand:'Expandir',
    minimize:'Minimizar',
    empty:'Esta pasta está vazia.',
    synced:'Sincronizado',
    public:'Público',
    private:'Privado',
  }:{
    loading:'Loading real GitHub repository...',
    noRepo:'No GitHub repository connected to this project.',
    branch:'Branch',
    latest:'Latest commit',
    code:'Code',
    about:'About',
    readme:'README',
    activity:'Activity',
    issues:'Issues',
    releases:'Releases',
    languages:'Languages',
    openGithub:'Open on GitHub',
    openCode:'Open in Code Studio',
    root:'root',
    parent:'Back one folder',
    expand:'Expand',
    minimize:'Collapse',
    empty:'This folder is empty.',
    synced:'Synced',
    public:'Public',
    private:'Private',
  }

  if(loading&&!browser){
    return <section className="repo-overview-loading"><RefreshCw className="security-spin"/><span>{labels.loading}</span></section>
  }
  if(!repository){
    return <section className="repo-overview-empty"><Code2/><span><strong>{labels.noRepo}</strong></span></section>
  }

  const parts=(path||'').split('/').filter(Boolean)
  const latestRelease=repository.latest_release&&Object.keys(repository.latest_release).length
    ? (repository.latest_release.tagName||repository.latest_release.tag_name||repository.latest_release.name||'Release')
    : null

  return <section className="repo-overview">
    <header className="repo-overview__top">
      <div className="repo-overview__identity">
        <Code2/>
        <span><strong>{repository.full_name}</strong><small>{repository.description||project.summary||''}</small></span>
        <em>{repository.private?<><LockKeyhole/>{labels.private}</>:labels.public}</em>
      </div>
      <div className="repo-overview__actions">
        <a className="action" href={repository.repo_url} target="_blank" rel="noreferrer"><ExternalLink/>{labels.openGithub}</a>
        <button type="button" className="action primary-action" onClick={()=>onNavigate?.('code')}><Code2/>{labels.openCode}</button>
      </div>
    </header>

    <div className="repo-overview__layout">
      <main className="repo-overview__main">
        <div className="repo-overview__toolbar">
          <span className="repo-overview__branch"><GitBranch/><b>{browser.branch||repository.default_branch||'main'}</b></span>
          <span><GitBranch/>{repository.forks||0}</span>
          <span><Star/>{repository.stars||0}</span>
          <span><CircleDot/>{repository.open_issues||0}</span>
        </div>

        <div className="repo-overview__commit">
          <span><GitCommitHorizontal/></span>
          <div><strong>{commit.messageHeadline||commit.message||labels.latest}</strong><small>{commit.author_login?('@'+commit.author_login+' · '):''}{relative(commit.committedDate||repository.pushed_at,language)}</small></div>
          {commit.oid&&<code>{String(commit.oid).slice(0,7)}</code>}
        </div>

        <div className="repo-overview__path">
          <button type="button" onClick={()=>load('')}>{repository.name}</button>
          {parts.map((part,index)=><React.Fragment key={index}><ChevronRight/><button type="button" onClick={()=>load(parts.slice(0,index+1).join('/'))}>{part}</button></React.Fragment>)}
        </div>

        <div className="repo-overview__files">
          {path&&<button type="button" className="repo-overview__file parent" onClick={()=>load(parts.slice(0,-1).join('/'))}><Folder/><span><strong>..</strong><small>{labels.parent}</small></span></button>}
          {items.map(item=>item.type==='dir'
            ? <button type="button" className="repo-overview__file" key={item.path} onClick={()=>load(item.path)}><FileIcon name={item.name} type={item.type}/><span><strong>{item.name}</strong><small>{item.type}</small></span><ChevronRight/></button>
            : <a className="repo-overview__file" key={item.path} href={item.html_url} target="_blank" rel="noreferrer"><FileIcon name={item.name} type={item.type}/><span><strong>{item.name}</strong><small>{item.size?Math.max(1,Math.round(item.size/1024))+' KB':'file'}</small></span><ExternalLink/></a>)}
          {!items.length&&<p>{labels.empty}</p>}
        </div>

        <section className="repo-overview__readme">
          <header><span><BookOpen/><strong>{labels.readme}</strong></span><button type="button" className="action" onClick={toggleReadme}><ChevronDown className={readmeOpen?'up':''}/>{readmeOpen?labels.minimize:labels.expand}</button></header>
          {readmeOpen&&<div className="repo-overview__readme-body">
            {readmeLoading?<p><RefreshCw className="security-spin"/>{labels.loading}</p>:readme?.html?<article className="devhub-markdown-body" dangerouslySetInnerHTML={{__html:readme.html}}/>:<p>README.md</p>}
          </div>}
        </section>
      </main>

      <aside className="repo-overview__aside">
        <section>
          <header><Globe2/><strong>{labels.about}</strong></header>
          <p>{repository.description||project.summary||'—'}</p>
          {repository.homepage_url&&<a href={repository.homepage_url} target="_blank" rel="noreferrer"><Globe2/>{repository.homepage_url.replace(/^https?:\/\//,'')}</a>}
          <button type="button" onClick={()=>onNavigate?.('reputation')}><Activity/>{labels.activity}</button>
          <button type="button" onClick={()=>onNavigate?.('issues')}><CircleDot/>{labels.issues} <b>{repository.open_issues||0}</b></button>
          <button type="button" onClick={()=>onNavigate?.('releases')}><Package/>{labels.releases} <b>{latestRelease||'—'}</b></button>
        </section>

        <section>
          <header><Languages/><strong>{labels.languages}</strong></header>
          <div className="repo-overview__languages">
            {languages.map(item=><span key={item.name}><b>{item.name}</b><small>{item.percent}%</small><i style={{width:item.percent+'%'}}/></span>)}
            {!languages.length&&<p>{repository.primary_language||'—'}</p>}
          </div>
        </section>

        <section className="repo-overview__sync">
          <header><RefreshCw/><strong>{labels.synced}</strong></header>
          <p>{relative(repository.last_sync_at,language)}</p>
        </section>
      </aside>
    </div>
  </section>
}
