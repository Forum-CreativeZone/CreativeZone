import React,{useEffect,useMemo,useState} from 'react'
import {
  Activity,BadgeCheck,BriefcaseBusiness,CalendarDays,ChevronDown,CircleDot,
  ExternalLink,Fingerprint,GitBranch,GitCommitHorizontal,GitPullRequest,
  Layers3,ListChecks,MessageSquare,RefreshCw,Rocket,Star,TrendingDown,
  TrendingUp,Trophy,UserCog,Users,
} from 'lucide-react'
import {getContributionPassport} from './services/contributionPassportApi'
import './ContributionPassport.css'

const DIMENSIONS=[
  ['delivery','Entrega',30],
  ['collaboration','Colaboração',25],
  ['consistency','Consistência',20],
  ['breadth','Diversidade',15],
  ['leadership','Liderança',10],
]

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
function levelLabel(value){
  return ({
    Explorer:'Explorador',
    Explorador:'Explorador',
    Contributor:'Contribuidor',
    Contribuidor:'Contribuidor',
    Builder:'Builder',
    Colaborador:'Colaborador',
    Maintainer:'Maintainer',
    Referência:'Referência',
  })[value]||value||'Explorador'
}
function relationLabel(value){
  return ({owner:'Responsável',maintainer:'Maintainer',contributor:'Colaborador',interested:'Interessado'})[value]||value||'Colaborador'
}
function statusLabel(value){
  return ({idea:'Ideia',planning:'Planejamento',active:'Ativo',paused:'Pausado',completed:'Concluído'})[value]||value
}
function monthLabel(value){
  const [year,month]=String(value||'').split('-').map(Number)
  if(!year||!month) return ''
  return new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(new Date(year,month-1,1)).replace('.','')
}

export function ContributionPassport({userId,navigate,notify}){
  const [passport,setPassport]=useState(null)
  const [loading,setLoading]=useState(true)

  async function load(){
    if(!userId) return
    setLoading(true)
    try{setPassport(await getContributionPassport(userId))}
    catch(error){notify?.(error?.message||'Não foi possível carregar o Contribution Passport.')}
    finally{setLoading(false)}
  }

  useEffect(()=>{load()},[userId])

  const maxMonth=useMemo(()=>Math.max(1,...(passport?.timeline||[]).map(item=>Number(item.count||0))),[passport?.timeline])

  if(loading&&!passport){
    return <section className="contribution-passport is-loading"><RefreshCw className="security-spin"/><span>Calculando Contribution Passport...</span></section>
  }
  if(!passport) return null

  const score=passport.score||{}
  const metrics=passport.metrics||{}
  const momentum=passport.momentum||{}
  const github=passport.github||{}
  const internal=passport.internal||{}
  const dimensions=score.dimensions||{}
  const total=Math.max(0,Math.min(100,Number(score.total||0)))
  const latest=passport.latest||null

  return <section className="contribution-passport">
    <header className="contribution-passport__head">
      <div className="contribution-passport__identity">
        <span className="contribution-passport__seal"><Fingerprint/></span>
        <span>
          <small>CONTRIBUTION PASSPORT · CREATIVEZONE DEVHUB</small>
          <strong>{passport.profile?.display_name||passport.profile?.username}</strong>
          <em>{passport.passport_id}</em>
        </span>
      </div>
      <div className="contribution-passport__verified">
        {github.connected
          ? <a href={github.profile_url||'#'} target="_blank" rel="noreferrer"><BadgeCheck/><span><strong>GitHub verificado</strong><small>@{github.username}</small></span><ExternalLink/></a>
          : <span><GitBranch/><span><strong>GitHub não conectado</strong><small>Métricas GitHub podem ficar incompletas.</small></span></span>}
      </div>
    </header>

    <div className="contribution-passport__score-grid">
      <article className="contribution-passport__score">
        <div className="contribution-passport__score-number"><strong>{total}</strong><small>/100</small></div>
        <div>
          <small>ÍNDICE DE CONTRIBUIÇÃO</small>
          <strong>{levelLabel(score.level)}</strong>
          <p>O volume possui teto por dimensão: centenas de commits sozinhos não dominam a nota.</p>
          <div className="contribution-passport__score-progress"><i style={{width:total+'%'}}/></div>
        </div>
      </article>

      <article className={'contribution-passport__momentum trend-'+(momentum.trend||'stable')}>
        <span>{momentum.trend==='up'?<TrendingUp/>:momentum.trend==='down'?<TrendingDown/>:<Activity/>}</span>
        <div><small>MOMENTUM · 30 DIAS</small><strong>{momentum.current_30??0}</strong><em>{momentum.delta>0?'+':''}{momentum.delta??0} vs. 30 dias anteriores</em></div>
      </article>

      <article>
        <span><CalendarDays/></span>
        <div><small>CONSISTÊNCIA · 90 DIAS</small><strong>{metrics.active_days_90??0}</strong><em>dias com contribuição verificada</em></div>
      </article>

      <article>
        <span><BriefcaseBusiness/></span>
        <div><small>PROJETOS</small><strong>{metrics.projects??0}</strong><em>{metrics.owned_projects??0} liderado(s)</em></div>
      </article>
    </div>

    <section className="contribution-passport__dimensions">
      <header><Layers3/><span><strong>Qualidade além de quantidade</strong><small>Cada dimensão tem um limite próprio para reduzir incentivo a spam de atividade.</small></span></header>
      <div>
        {DIMENSIONS.map(([key,label,max])=>{
          const row=dimensions[key]||{score:0,max}
          const pct=Math.max(0,Math.min(100,Math.round(Number(row.score||0)*100/Number(row.max||max))))
          return <article key={key}>
            <span><strong>{label}</strong><small>{row.score||0}/{row.max||max}</small></span>
            <div><i style={{width:pct+'%'}}/></div>
          </article>
        })}
      </div>
    </section>

    <div className="contribution-passport__metrics">
      <article><GitCommitHorizontal/><span><strong>{metrics.commits??0}</strong><small>Commits</small></span></article>
      <article><GitPullRequest/><span><strong>{metrics.pull_request_events??0}</strong><small>Eventos de PR</small></span></article>
      <article><BadgeCheck/><span><strong>{metrics.reviews??0}</strong><small>Reviews</small></span></article>
      <article><CircleDot/><span><strong>{metrics.issues??0}</strong><small>Issues</small></span></article>
      <article><Rocket/><span><strong>{metrics.releases??0}</strong><small>Releases</small></span></article>
      <article><MessageSquare/><span><strong>{metrics.project_updates??0}</strong><small>Updates</small></span></article>
    </div>

    <div className="contribution-passport__main">
      <section className="contribution-passport__timeline">
        <header><Activity/><span><strong>Evolução</strong><small>Atividade pública verificada nos últimos 6 meses.</small></span></header>
        <div className="contribution-passport__bars">
          {(passport.timeline||[]).map(item=>{
            const height=Number(item.count||0)>0?Math.max(6,Math.round(Number(item.count||0)*100/maxMonth)):2
            return <div key={item.month} title={String(item.count||0)+' atividade(s)'}>
              <span><i style={{height:height+'%'}}/></span>
              <b>{item.count||0}</b>
              <small>{monthLabel(item.month)}</small>
            </div>
          })}
        </div>
        {latest&&<div className="contribution-passport__latest">
          <span><strong>Última contribuição</strong><small>{relative(latest.occurred_at)}</small></span>
          <p>{latest.title}</p>
          {latest.summary&&<em>{latest.summary}</em>}
          {latest.target_url&&<a href={latest.target_url} target="_blank" rel="noreferrer">Abrir origem <ExternalLink/></a>}
        </div>}
      </section>

      <section className="contribution-passport__areas">
        <header><Star/><span><strong>Áreas observadas</strong><small>Derivadas dos projetos e tecnologias onde há contribuição verificável.</small></span></header>
        <div>{(passport.areas||[]).map(item=><span key={item.name}>{item.name}</span>)}</div>
        {!(passport.areas||[]).length&&<p>Nenhuma área foi inferida ainda.</p>}
      </section>
    </div>

    <section className="contribution-passport__projects">
      <header><BriefcaseBusiness/><span><strong>Projetos de contribuição</strong><small>Projetos públicos em que este membro lidera, participa ou possui atividade verificável.</small></span></header>
      <div>
        {(passport.projects||[]).map(project=><button type="button" key={project.id} onClick={()=>navigate?.('/projetos/'+encodeURIComponent(project.slug))}>
          <span className="contribution-passport__project-icon"><BriefcaseBusiness/></span>
          <span><strong>{project.title}</strong><small>{relationLabel(project.relationship)} · {statusLabel(project.status)}</small></span>
          <span className="contribution-passport__project-numbers"><b>{project.activity_90d||0}</b><small>90 dias</small></span>
          <span className="contribution-passport__project-numbers"><b>{project.commits||0}</b><small>commits</small></span>
        </button>)}
        {!(passport.projects||[]).length&&<p className="contribution-passport__empty">Ainda não há projetos públicos com contribuição verificável.</p>}
      </div>
    </section>

    {internal.visible&&<section className="contribution-passport__internal">
      <header><ListChecks/><span><strong>Entrega interna verificada</strong><small>Visível somente para o próprio membro e para o Arquiteto CreativeZone.</small></span></header>
      <div>
        <span><b>{internal.cards_completed??0}</b><small>Cards concluídos</small></span>
        <span><b>{internal.cards_created??0}</b><small>Cards criados</small></span>
        <span><b>{internal.kanban_comments??0}</b><small>Comentários no Kanban</small></span>
        <span><b>{internal.private_project_memberships??0}</b><small>Projetos privados</small></span>
      </div>
    </section>}

    <details className="contribution-passport__methodology">
      <summary><UserCog/> Como o score é calculado? <ChevronDown/></summary>
      <div>
        <article><strong>Entrega · 30</strong><p>{passport.methodology?.delivery}</p></article>
        <article><strong>Colaboração · 25</strong><p>{passport.methodology?.collaboration}</p></article>
        <article><strong>Consistência · 20</strong><p>{passport.methodology?.consistency}</p></article>
        <article><strong>Diversidade · 15</strong><p>{passport.methodology?.breadth}</p></article>
        <article><strong>Liderança · 10</strong><p>{passport.methodology?.leadership}</p></article>
        <article className="anti-spam"><Trophy/><span><strong>Proteção contra volume artificial</strong><p>{passport.methodology?.anti_spam}</p></span></article>
      </div>
    </details>

    <footer><span>Atualizado {relative(passport.generated_at)}</span><button type="button" className="action" onClick={load}><RefreshCw/>Atualizar passaporte</button></footer>
  </section>
}
