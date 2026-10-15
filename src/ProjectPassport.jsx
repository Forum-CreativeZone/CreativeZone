import React,{useEffect,useMemo,useState} from 'react'
import {
  Activity,CheckCircle2,CircleDot,Code2,ExternalLink,Fingerprint,GitBranch,
  GitCommitHorizontal,GitPullRequest,Globe2,Languages,LockKeyhole,RefreshCw,
  Rocket,ShieldCheck,Star,Users,Workflow,XCircle,
} from 'lucide-react'
import {getProjectPassport} from './services/extendedApi'
import {supabase} from './services/supabaseClient'
import './ProjectPassport.css'

function relative(value){
  if(!value) return '—'
  const diff=Math.max(0,Date.now()-new Date(value).getTime())
  const minutes=Math.floor(diff/60000)
  if(minutes<1) return 'agora'
  if(minutes<60) return 'há '+minutes+' min'
  const hours=Math.floor(minutes/60)
  if(hours<24) return 'há '+hours+' h'
  const days=Math.floor(hours/24)
  return 'há '+days+' dia'+(days===1?'':'s')
}
function statusLabel(value){
  return ({idea:'Ideia',planning:'Planejamento',active:'Ativo',paused:'Pausado',completed:'Concluído',archived:'Arquivado'})[value]||value
}
function languageRows(languages={}){
  const rows=Object.entries(languages||{}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,6)
  const total=rows.reduce((sum,[,bytes])=>sum+Number(bytes||0),0)
  return rows.map(([name,bytes])=>({name,percent:total?Math.round(Number(bytes||0)*100/total):0}))
}
function proofRows(proofs={}){
  return [
    ['identity_complete','Identidade'],
    ['repository_connected','Repositório'],
    ['repository_synced','Sincronização'],
    ['team_active','Equipe'],
    ['recent_activity','Atividade'],
    ['security_audited','Segurança'],
    ['release_published','Release'],
    ['website_available','Site'],
  ].map(([key,label])=>({key,label,ok:Boolean(proofs?.[key])}))
}

export function ProjectPassport({project,notify}){
  const [passport,setPassport]=useState(null)
  const [loading,setLoading]=useState(true)
  const [expanded,setExpanded]=useState(false)

  async function load(){
    if(!project?.id) return
    try{setPassport(await getProjectPassport(project.id))}
    catch(error){notify?.(error?.message||'Não foi possível carregar o Project Passport.')}
    finally{setLoading(false)}
  }

  useEffect(()=>{setLoading(true);load()},[project?.id])

  useEffect(()=>{
    if(!supabase||!project?.id) return undefined
    const channel=supabase
      .channel('creativezone-project-passport-'+project.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'project_activity_feed',filter:`project_id=eq.${project.id}`},load)
      .subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[project?.id])

  const languages=useMemo(()=>languageRows(passport?.repository?.languages),[passport?.repository?.languages])
  const proofs=useMemo(()=>proofRows(passport?.proofs),[passport?.proofs])

  if(loading&&!passport){
    return <section className="project-passport-card is-loading"><RefreshCw className="security-spin"/><span>Carregando Project Passport...</span></section>
  }
  if(!passport) return null

  const repo=passport.repository||{}
  const security=passport.security||{}
  const activity=passport.activity||{}
  const maturity=passport.maturity||{}
  const team=passport.team||{}
  const score=Math.max(0,Math.min(100,Number(maturity.score||0)))
  const latestRelease=repo.latest_release&&Object.keys(repo.latest_release).length
    ? (repo.latest_release.tagName||repo.latest_release.tag_name||repo.latest_release.name||'Release publicada')
    : null

  return <section className="project-passport-card">
    <header className="project-passport-card__header">
      <div className="project-passport-card__identity">
        <span className="project-passport-card__seal"><Fingerprint/></span>
        <span className="project-passport-card__title">
          <small>PROJECT PASSPORT · CREATIVEZONE DEVHUB</small>
          <strong>{passport.project?.title||project.title}</strong>
          <em>{passport.passport_id}</em>
        </span>
      </div>
      <div className="project-passport-card__badges">
        <span className={'project-passport-card__badge status-'+passport.project?.status}>{statusLabel(passport.project?.status)}</span>
        <span className="project-passport-card__badge">{passport.project?.visibility==='public'?<Globe2/>:<LockKeyhole/>}{passport.project?.visibility==='public'?'Público':'Somente membros'}</span>
      </div>
    </header>

    <div className="project-passport-card__summary">
      <article className="project-passport-card__maturity">
        <div className="project-passport-card__score"><strong>{maturity.score??'—'}</strong><span>pontos de 100</span></div>
        <div className="project-passport-card__maturity-copy">
          <small>MATURIDADE DO PROJETO</small>
          <strong>{maturity.level||'—'}</strong>
          <p>Resumo técnico baseado em identidade, GitHub, equipe, atividade, segurança, release e presença web.</p>
          {maturity.score!==null&&maturity.score!==undefined&&<div className="project-passport-card__progress"><i style={{width:score+'%'}}/></div>}
        </div>
      </article>

      <div className="project-passport-card__metrics">
        <article className="project-passport-card__metric">
          <span><Users/></span><small>EQUIPE</small><strong>{team.active_members??0}</strong><em>membro(s) ativo(s)</em>
        </article>
        <article className="project-passport-card__metric">
          <span><Activity/></span><small>ATIVIDADE · 30 DIAS</small><strong>{activity.visible===false?'—':activity.last_30_days??0}</strong><em>{activity.visible===false?'restrito':(activity.contributors??0)+' fonte(s) ativa(s)'}</em>
        </article>
        <article className="project-passport-card__metric security">
          <span><ShieldCheck/></span><small>SECURITY SCORE</small><strong>{security.visible===false?'—':security.score??100}</strong><em>{security.visible===false?'restrito':(security.vulnerabilities??0)+' vulnerabilidade(s)'}</em>
        </article>
        <article className="project-passport-card__metric">
          <span><GitBranch/></span><small>GITHUB</small><strong>{repo.connected?(repo.sync_status==='ok'?'OK':'…'):'—'}</strong><em>{repo.details_restricted?'repositório privado':repo.connected?'sincronizado':'não conectado'}</em>
        </article>
      </div>
    </div>

    {repo.connected&&<div className={'project-passport-card__repo '+(repo.details_restricted?'restricted':'')}>
      {repo.details_restricted?<LockKeyhole/>:<Code2/>}
      <div>
        <strong>{repo.details_restricted?'Repositório privado conectado':repo.full_name||'GitHub conectado'}</strong>
        <small>{repo.details_restricted?'Detalhes visíveis apenas aos participantes.':(repo.default_branch||'main')+' · atualizado '+relative(repo.last_sync_at)}</small>
      </div>
      {!repo.details_restricted&&<div className="project-passport-card__repo-stats">
        <span><Star/>{repo.stars??0}</span>
        <span><CircleDot/>{repo.open_issues??0}</span>
        <span><GitBranch/>{repo.forks??0}</span>
      </div>}
      {!repo.details_restricted&&repo.repo_url&&<a href={repo.repo_url} target="_blank" rel="noreferrer" aria-label="Abrir repositório no GitHub"><ExternalLink/></a>}
    </div>}

    <div className="project-passport-card__body">
      <section className="project-passport-card__panel">
        <header><Languages/><strong>Technology DNA</strong></header>
        {languages.length
          ? <div className="project-passport-card__languages">{languages.map(item=><span key={item.name}><b>{item.name}</b><small>{item.percent}%</small></span>)}</div>
          : <p className="project-passport-card__latest">Linguagens ainda não disponíveis.</p>}
      </section>

      <section className="project-passport-card__panel">
        <header><Workflow/><strong>Operational Pulse · 30 dias</strong></header>
        {activity.visible===false
          ? <p className="project-passport-card__latest">Métricas restritas aos participantes do projeto.</p>
          : <>
              <div className="project-passport-card__pulse">
                <span><GitCommitHorizontal/><b>{activity.commits??0}</b><small>Commits</small></span>
                <span><GitPullRequest/><b>{activity.pull_requests??0}</b><small>PRs</small></span>
                <span><CircleDot/><b>{activity.issues??0}</b><small>Issues</small></span>
                <span><Workflow/><b>{activity.workflow_runs??0}</b><small>Builds</small></span>
              </div>
              {activity.latest&&<p className="project-passport-card__latest"><strong>Última atividade:</strong> {activity.latest.title} · {relative(activity.latest.occurred_at)}</p>}
            </>}
      </section>
    </div>

    <div className="project-passport-card__proofs">
      <header><CheckCircle2/><strong>Provas do projeto</strong></header>
      <div className="project-passport-card__proof-list">
        {proofs.map(item=><span key={item.key} className={item.ok?'ok':'pending'}>{item.ok?<CheckCircle2/>:<XCircle/>}{item.label}</span>)}
      </div>
    </div>

    {expanded&&<div className="project-passport-card__details">
      <section><strong>Identidade</strong><p>Criado há {passport.project?.age_days??0} dia(s). Status atual: {statusLabel(passport.project?.status)}.</p></section>
      <section><strong>GitHub</strong><p>{repo.connected?(repo.details_restricted?'Repositório conectado e privado.':'Push '+relative(repo.pushed_at)+' · sync '+relative(repo.last_sync_at)):'Nenhum repositório conectado.'}</p></section>
      <section><strong>Segurança</strong><p>{security.visible===false?'Detalhes restritos.':security.last_audited_at?('Auditoria '+relative(security.last_audited_at)+' · '+(security.dependencies??0)+' dependência(s).'):'Auditoria ainda não concluída.'}</p></section>
      <section><strong>Build</strong><p>{activity.latest_build?activity.latest_build.title+' · '+relative(activity.latest_build.occurred_at):'Nenhum build registrado.'}</p></section>
      <section className="wide"><strong>Como a maturidade é calculada</strong><p>Identidade até 10 pontos · GitHub e sincronização 20 · Equipe 15 · Atividade recente 20 · Segurança 20 · Release 10 · Site publicado 5. O total máximo é 100.</p></section>
      {(passport.project?.skills_needed||[]).length>0&&<section className="wide"><strong>Competências procuradas</strong><div className="project-passport-card__skills">{passport.project.skills_needed.map(item=><span key={item}>{item}</span>)}</div></section>}
      {latestRelease&&<section><strong>Release</strong><p><Rocket/> {latestRelease}</p></section>}
    </div>}

    <footer className="project-passport-card__footer">
      <span>Atualizado {relative(passport.generated_at)}</span>
      <button type="button" className="action" onClick={()=>setExpanded(value=>!value)}>{expanded?'Ocultar detalhes':'Ver passaporte completo'}</button>
    </footer>
  </section>
}
