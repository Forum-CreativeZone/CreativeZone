import React,{useEffect,useMemo,useState} from 'react'
import {
  Activity,CheckCircle2,CircleDot,Code2,ExternalLink,Fingerprint,GitBranch,
  GitCommitHorizontal,GitPullRequest,Globe2,Languages,LockKeyhole,Package,
  RefreshCw,Rocket,ShieldCheck,Star,Users,Workflow,XCircle,
} from 'lucide-react'
import {getProjectPassport} from './services/extendedApi'
import {supabase} from './services/supabaseClient'

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
    try{
      const next=await getProjectPassport(project.id)
      setPassport(next)
    }catch(error){
      notify?.(error?.message||'Não foi possível carregar o Project Passport.')
    }finally{
      setLoading(false)
    }
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
    return <section className="project-passport is-loading"><RefreshCw className="security-spin"/><span>Emitindo Project Passport...</span></section>
  }
  if(!passport) return null

  const repo=passport.repository||{}
  const security=passport.security||{}
  const activity=passport.activity||{}
  const maturity=passport.maturity||{}
  const team=passport.team||{}
  const owner=project?.owner||{}
  const members=(project?.project_members||[]).filter(item=>item.status==='active').slice(0,6)

  return <section className={'project-passport maturity-'+String(maturity.level||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}>
    <header className="project-passport-head">
      <div className="project-passport-identity">
        <span className="project-passport-seal"><Fingerprint/></span>
        <span>
          <small>PROJECT PASSPORT · CREATIVEZONE DEVHUB</small>
          <strong>{passport.project?.title||project.title}</strong>
          <em>{passport.passport_id} · LIVE</em>
        </span>
      </div>
      <div className="project-passport-head-status">
        <span className={'project-passport-project-status status-'+passport.project?.status}>{statusLabel(passport.project?.status)}</span>
        <span>{passport.project?.visibility==='public'?<Globe2/>:<LockKeyhole/>}{passport.project?.visibility==='public'?'Público':'Somente membros'}</span>
      </div>
    </header>

    <div className="project-passport-core">
      <article className="project-passport-maturity">
        <div className="passport-score"><strong>{maturity.score??'—'}</strong><small>/100</small></div>
        <span><small>MATURIDADE DO PROJETO</small><strong>{maturity.level||'—'}</strong><em>Identidade, GitHub, equipe, atividade, segurança, release e presença web.</em></span>
      </article>

      <article>
        <span className="passport-metric-icon"><Users/></span>
        <span><small>EQUIPE</small><strong>{team.active_members??0}</strong><em>membro{Number(team.active_members)===1?'':'s'} ativo{Number(team.active_members)===1?'':'s'}</em></span>
      </article>

      <article>
        <span className="passport-metric-icon"><Activity/></span>
        <span><small>ATIVIDADE · 30 DIAS</small><strong>{activity.visible===false?'—':activity.last_30_days??0}</strong><em>{activity.visible===false?'Métricas restritas':(activity.contributors??0)+' contribuidor(es)'}</em></span>
      </article>

      <article className={'passport-security '+(security.visible===false?'restricted':'')}>
        <span className="passport-metric-icon"><ShieldCheck/></span>
        <span><small>SECURITY SCORE</small><strong>{security.visible===false?'—':security.score??100}</strong><em>{security.visible===false?'Restrito ao projeto':(security.vulnerabilities??0)+' vulnerabilidade(s)'}</em></span>
      </article>
    </div>

    <div className="project-passport-owner-repo">
      <section>
        <header><Users/><strong>Responsável</strong></header>
        <div className="passport-owner">
          {owner.avatar_url?<img src={owner.avatar_url} alt=""/>:<span>{String(owner.display_name||owner.username||'C').slice(0,1).toUpperCase()}</span>}
          <div><strong>{owner.display_name||owner.username||'CreativeZone'}</strong><small>{owner.username?'@'+owner.username:'Dono do projeto'}</small></div>
        </div>
        <div className="passport-team-mini">
          {members.map(item=>item.profile?.avatar_url
            ? <img key={item.user_id} src={item.profile.avatar_url} alt="" title={item.profile.display_name||item.profile.username||'Membro'}/>
            : <span key={item.user_id} title={item.profile?.display_name||item.profile?.username||'Membro'}>{String(item.profile?.display_name||item.profile?.username||'?').slice(0,1).toUpperCase()}</span>)}
        </div>
      </section>

      <section className="passport-repository-card">
        <header><GitBranch/><strong>Repositório</strong></header>
        {!repo.connected
          ? <p>Nenhum repositório conectado.</p>
          : repo.details_restricted
            ? <p><LockKeyhole/> Repositório privado conectado. Detalhes disponíveis somente aos participantes.</p>
            : <>
                <div className="passport-repo-name"><Code2/><span><strong>{repo.full_name||'GitHub conectado'}</strong><small>{repo.default_branch||'main'} · {repo.sync_status||'pending'}</small></span>{repo.repo_url&&<a href={repo.repo_url} target="_blank" rel="noreferrer"><ExternalLink/></a>}</div>
                <div className="passport-repo-stats">
                  <span><Star/>{repo.stars??0}</span><span><CircleDot/>{repo.open_issues??0}</span><span><GitBranch/>{repo.forks??0}</span>
                  {repo.license&&<span><Package/>{repo.license}</span>}
                </div>
              </>}
      </section>
    </div>

    {(languages.length>0||activity.visible!==false)&&<div className="project-passport-technical">
      {languages.length>0&&<section>
        <header><Languages/><strong>Technology DNA</strong></header>
        <div className="passport-languages">{languages.map(item=><span key={item.name}><b>{item.name}</b><small>{item.percent}%</small><i style={{'--passport-language':item.percent+'%'}}/></span>)}</div>
      </section>}

      {activity.visible!==false&&<section>
        <header><Workflow/><strong>Operational Pulse · 30 dias</strong></header>
        <div className="passport-pulse">
          <span><GitCommitHorizontal/><b>{activity.commits??0}</b><small>Commits</small></span>
          <span><GitPullRequest/><b>{activity.pull_requests??0}</b><small>PRs</small></span>
          <span><CircleDot/><b>{activity.issues??0}</b><small>Issues</small></span>
          <span><Workflow/><b>{activity.workflow_runs??0}</b><small>Builds</small></span>
        </div>
        {activity.latest&&<p className="passport-latest"><strong>Última atividade:</strong> {activity.latest.title} · {relative(activity.latest.occurred_at)}</p>}
      </section>}
    </div>}

    <div className="project-passport-proof">
      <header><CheckCircle2/><span><strong>Provas do projeto</strong><small>Dados derivados do estado real da CreativeZone, GitHub e Security.</small></span></header>
      <div>{proofs.map(item=><span key={item.key} className={item.ok?'ok':'pending'}>{item.ok?<CheckCircle2/>:<XCircle/>}{item.label}</span>)}</div>
    </div>

    {expanded&&<div className="project-passport-details">
      <section><strong>Identidade</strong><p>Criado há {passport.project?.age_days??0} dia(s) · status {statusLabel(passport.project?.status)}.</p></section>
      <section><strong>GitHub</strong><p>{repo.connected?(repo.details_restricted?'Conectado e privado.':('Última sincronização '+relative(repo.last_sync_at)+' · push '+relative(repo.pushed_at))):'Ainda sem repositório.'}</p></section>
      <section><strong>Segurança</strong><p>{security.visible===false?'Detalhes restritos.':security.last_audited_at?('Última auditoria '+relative(security.last_audited_at)+' · '+(security.dependencies??0)+' dependência(s).'):'Auditoria ainda não concluída.'}</p></section>
      <section><strong>Build</strong><p>{activity.latest_build?activity.latest_build.title+' · '+relative(activity.latest_build.occurred_at):'Nenhum build registrado.'}</p></section>
      {(passport.project?.skills_needed||[]).length>0&&<section className="passport-skills"><strong>Competências procuradas</strong><div>{passport.project.skills_needed.map(item=><span key={item}>{item}</span>)}</div></section>}
      {repo.latest_release&&Object.keys(repo.latest_release).length>0&&<section><strong>Release</strong><p><Rocket/> {repo.latest_release.tagName||repo.latest_release.tag_name||repo.latest_release.name||'Release publicada'}</p></section>}
    </div>}

    <footer className="project-passport-footer">
      <span>Atualizado {relative(passport.generated_at)}</span>
      <button type="button" className="action" onClick={()=>setExpanded(value=>!value)}>{expanded?'Ocultar detalhes':'Ver passaporte completo'}</button>
    </footer>
  </section>
}
