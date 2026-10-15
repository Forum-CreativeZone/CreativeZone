import React,{useEffect,useState} from 'react'
import {Activity,BookOpen,BriefcaseBusiness,CheckCircle2,CircleDot,Code2,Columns3,GitBranch,GitPullRequest,Globe2,GraduationCap,MessagesSquare,Package,RefreshCw,ShieldCheck,Star,Terminal,Users,Workflow} from 'lucide-react'
import {getProjectActivity,getProjectPassport} from './services/extendedApi'
import {getProjectRecruiting} from './services/projectRecruitingApi'
import {getProjectKanban} from './services/projectKanbanApi'
import './ProjectOverviewDashboard.css'

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

function Metric({icon:Icon,label,value,detail,tone='neutral'}){
  return <article className={'project-overview-metric tone-'+tone}><span><Icon/></span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>
}

function ModuleCard({icon:Icon,title,description,meta,action,onClick,accent='default'}){
  return <button type="button" className={'project-overview-module accent-'+accent} onClick={onClick}><span className="project-overview-module__icon"><Icon/></span><span className="project-overview-module__copy"><strong>{title}</strong><small>{description}</small></span><span className="project-overview-module__meta">{meta}</span><em>{action}</em></button>
}

export function ProjectOverviewDashboard({project,session,language='pt',onNavigate,notify}){
  const [passport,setPassport]=useState(null)
  const [activity,setActivity]=useState([])
  const [recruiting,setRecruiting]=useState(null)
  const [kanban,setKanban]=useState(null)
  const [loading,setLoading]=useState(true)

  async function load(){
    if(!project?.id) return
    setLoading(true)
    try{
      const tasks=[getProjectPassport(project.id),getProjectActivity(project.id,8),getProjectRecruiting(project.id),session?.user?getProjectKanban(project.id):Promise.resolve(null)]
      const [passportResult,activityResult,recruitingResult,kanbanResult]=await Promise.allSettled(tasks)
      if(passportResult.status==='fulfilled') setPassport(passportResult.value)
      if(activityResult.status==='fulfilled') setActivity(activityResult.value||[])
      if(recruitingResult.status==='fulfilled') setRecruiting(recruitingResult.value)
      if(kanbanResult.status==='fulfilled') setKanban(kanbanResult.value)
    }catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível atualizar a visão geral.':'Could not refresh overview.'))}
    finally{setLoading(false)}
  }

  useEffect(()=>{load()},[project?.id,session?.user?.id])

  const activeMembers=(project?.project_members||[]).filter(item=>item.status==='active')
  const pendingMembers=(project?.project_members||[]).filter(item=>item.status==='pending')
  const repo=passport?.repository||{}
  const security=passport?.security||{}
  const passportActivity=passport?.activity||{}
  const maturity=passport?.maturity||{}
  const openings=(recruiting?.openings||[]).filter(item=>item.status==='open')
  const cards=kanban?.cards||[]
  const doneColumnIds=new Set((kanban?.columns||[]).filter(item=>item.is_done).map(item=>item.id))
  const doneCards=cards.filter(item=>doneColumnIds.has(item.column_id)).length
  const latestBuild=passportActivity?.latest_build||null
  const latestEvent=activity?.[0]||passportActivity?.latest||null
  const primaryLanguage=repo?.primary_language||Object.keys(repo?.languages||{})[0]||'—'
  const tags=[...(project?.tags||[]),...(project?.skills_needed||[])].filter((item,index,self)=>item&&self.indexOf(item)===index).slice(0,8)
  const mentors=1+activeMembers.filter(item=>item.role==='maintainer'&&item.user_id!==project?.owner_id).length
  const latestRelease=repo?.latest_release&&Object.keys(repo.latest_release||{}).length
    ? (repo.latest_release.tagName||repo.latest_release.tag_name||repo.latest_release.name||'release')
    : null

  const L=language==='pt'?{
    kicker:'PAINEL DO PROJETO',title:'Visão geral',intro:'Um resumo vivo do projeto. Abra qualquer módulo para trabalhar sem percorrer uma página enorme.',refresh:'Atualizar resumo',maturity:'Maturidade',security:'Segurança',activity:'Atividade · 30 dias',team:'Equipe',code:'Código & Repositório',codeDesc:'Arquivos, branch, commits e editor profissional.',issues:'Issues & Pull Requests',issuesDesc:'Pendências, revisões e alterações do GitHub.',board:'Quadro / Kanban',boardDesc:'Organize tarefas do backlog até a conclusão.',recruiting:'Recrutamento',recruitingDesc:'Encontre pessoas para colaborar com o projeto.',actions:'Automações',actionsDesc:'Builds, CI/CD e execução recente do GitHub Actions.',community:'Comunidade',communityDesc:'Atualizações, decisões e movimento do projeto.',learning:'Aprendizado',learningDesc:'Tecnologias e competências relacionadas ao projeto.',releases:'Versões',releasesDesc:'Releases e entregas publicadas no GitHub.',reputation:'Reputação',reputationDesc:'Maturidade e sinais de confiança do projeto.',mentors:'Mentores',mentorsDesc:'Responsáveis e pessoas que podem orientar contribuições.',teamChat:'Chat da equipe',teamChatDesc:'Converse com colaboradores sem sair da CreativeZone.',terminal:'Terminal',terminalDesc:'Comandos Git seguros dentro do DevHub.',open:'Abrir',repoConnected:'repositório conectado',noRepo:'sem repositório',openIssues:'issues abertas',prActivity:'PRs em 30 dias',cards:'cards',done:'concluídos',openings:'oportunidades abertas',noOpenings:'nenhuma vaga aberta',build:'último build',noBuild:'nenhum build',updates:'atualizações publicadas',topics:'competências mapeadas',recent:'Pulso recente',recentDesc:'Últimos acontecimentos registrados pelo DevHub.',noActivity:'Ainda não há atividade recente.',members:'membros ativos',pending:'aguardando entrada',vulnerabilities:'vulnerabilidades'}
    :{kicker:'PROJECT DASHBOARD',title:'Overview',intro:'A live summary of the project. Open any module to work without scrolling through a huge page.',refresh:'Refresh overview',maturity:'Maturity',security:'Security',activity:'Activity · 30 days',team:'Team',code:'Code & Repository',codeDesc:'Files, branch, commits and professional editor.',issues:'Issues & Pull Requests',issuesDesc:'GitHub work, reviews and proposed changes.',board:'Projects / Kanban',boardDesc:'Move work from backlog through completion.',recruiting:'Recruiting',recruitingDesc:'Find people to collaborate on the project.',actions:'Actions',actionsDesc:'Builds, CI/CD and recent GitHub Actions runs.',community:'Community',communityDesc:'Updates, decisions and project movement.',learning:'Learning',learningDesc:'Technologies and skills related to the project.',releases:'Releases',releasesDesc:'Published releases and deliveries from GitHub.',reputation:'Reputation',reputationDesc:'Project maturity and trust signals.',mentors:'Mentors',mentorsDesc:'Project leads who can guide contributions.',teamChat:'Team Chat',teamChatDesc:'Talk to collaborators without leaving CreativeZone.',terminal:'Terminal',terminalDesc:'Secure Git commands inside DevHub.',open:'Open',repoConnected:'repository connected',noRepo:'no repository',openIssues:'open issues',prActivity:'PRs in 30 days',cards:'cards',done:'done',openings:'open opportunities',noOpenings:'no openings',build:'latest build',noBuild:'no build',updates:'published updates',topics:'mapped skills',recent:'Recent pulse',recentDesc:'Latest events recorded by DevHub.',noActivity:'No recent activity yet.',members:'active members',pending:'awaiting entry',vulnerabilities:'vulnerabilities'}

  return <section className="project-overview-dashboard">
    <header className="project-overview-dashboard__head"><div><span className="project-overview-dashboard__mark"><Activity/></span><span><small>{L.kicker}</small><strong>{L.title}</strong><p>{L.intro}</p></span></div><button type="button" className="action" onClick={load} disabled={loading}><RefreshCw className={loading?'security-spin':''}/>{L.refresh}</button></header>

    <div className="project-overview-dashboard__metrics">
      <Metric icon={Activity} label={L.maturity} value={maturity.score??'—'} detail={maturity.level||'—'} tone="red"/>
      <Metric icon={ShieldCheck} label={L.security} value={security.visible===false?'—':security.score??100} detail={security.visible===false?'—':String(security.vulnerabilities??0)+' '+L.vulnerabilities} tone="success"/>
      <Metric icon={Workflow} label={L.activity} value={passportActivity.visible===false?'—':passportActivity.last_30_days??activity.length} detail={String(passportActivity.commits??0)+' commits · '+String(passportActivity.pull_requests??0)+' PRs'}/>
      <Metric icon={Users} label={L.team} value={activeMembers.length} detail={String(activeMembers.length)+' '+L.members+(pendingMembers.length?' · '+pendingMembers.length+' '+L.pending:'')}/>
    </div>

    <div className="project-overview-dashboard__modules">
      <ModuleCard icon={Code2} title={L.code} description={L.codeDesc} meta={repo.connected?String(repo.full_name||project.repo_url||'')+' · '+primaryLanguage:L.noRepo} action={L.open} onClick={()=>onNavigate?.('code')} accent="red"/>
      <ModuleCard icon={GitPullRequest} title={L.issues} description={L.issuesDesc} meta={String(repo.open_issues??0)+' '+L.openIssues+' · '+String(passportActivity.pull_requests??0)+' '+L.prActivity} action={L.open} onClick={()=>onNavigate?.('issues')}/>
      <ModuleCard icon={Columns3} title={L.board} description={L.boardDesc} meta={kanban?String(cards.length)+' '+L.cards+' · '+String(doneCards)+' '+L.done:(session?.user?'—':'Private')} action={L.open} onClick={()=>onNavigate?.('projects')}/>
      <ModuleCard icon={BriefcaseBusiness} title={L.recruiting} description={L.recruitingDesc} meta={openings.length?String(openings.length)+' '+L.openings:L.noOpenings} action={L.open} onClick={()=>onNavigate?.('recruiting')} accent={openings.length?'red':'default'}/>
      <ModuleCard icon={Workflow} title={L.actions} description={L.actionsDesc} meta={latestBuild?latestBuild.title+' · '+relative(latestBuild.occurred_at,language):L.noBuild} action={L.open} onClick={()=>onNavigate?.('actions')}/>
      <ModuleCard icon={Globe2} title={L.community} description={L.communityDesc} meta={String((project.project_updates||[]).length)+' '+L.updates} action={L.open} onClick={()=>onNavigate?.('community')}/>
      <ModuleCard icon={Users} title={L.team} description={language==='pt'?'Membros, responsáveis e entrada de colaboradores.':'Members, leads and collaborator onboarding.'} meta={String(activeMembers.length)+' '+L.members} action={L.open} onClick={()=>onNavigate?.('team')}/>
      <ModuleCard icon={BookOpen} title={L.learning} description={L.learningDesc} meta={String(tags.length)+' '+L.topics} action={L.open} onClick={()=>onNavigate?.('learning')}/>
      <ModuleCard icon={Package} title={L.releases} description={L.releasesDesc} meta={latestRelease||L.noBuild} action={L.open} onClick={()=>onNavigate?.('releases')}/>
      <ModuleCard icon={ShieldCheck} title={L.security} description={language==='pt'?'Auditoria, Security Score e OSV.':'Audit, Security Score and OSV.'} meta={String(security.score??100)+'/100 · '+String(security.vulnerabilities??0)+' '+L.vulnerabilities} action={L.open} onClick={()=>onNavigate?.('security')} accent="red"/>
      <ModuleCard icon={Star} title={L.reputation} description={L.reputationDesc} meta={String(maturity.score??'—')+'/100 · '+String(maturity.level||'—')} action={L.open} onClick={()=>onNavigate?.('reputation')}/>
      <ModuleCard icon={GraduationCap} title={L.mentors} description={L.mentorsDesc} meta={String(mentors)+' '+(language==='pt'?'responsável(is)':'lead(s)')} action={L.open} onClick={()=>onNavigate?.('mentors')}/>
      <ModuleCard icon={MessagesSquare} title={L.teamChat} description={L.teamChatDesc} meta={String(activeMembers.length)+' '+L.members} action={L.open} onClick={()=>onNavigate?.('team-chat')}/>
      <ModuleCard icon={Terminal} title={L.terminal} description={L.terminalDesc} meta={repo.default_branch?repo.default_branch+' · GitHub':'GitHub'} action={L.open} onClick={()=>onNavigate?.('terminal')}/>
    </div>

    <div className="project-overview-dashboard__lower">
      <section className="project-overview-dashboard__pulse"><header><Activity/><span><strong>{L.recent}</strong><small>{L.recentDesc}</small></span></header><div>{activity.slice(0,5).map(item=><button key={item.id} type="button" onClick={()=>onNavigate?.(item.source==='security'?'security':'actions')}><span className={'pulse-dot source-'+item.source}>{item.status==='success'?<CheckCircle2/>:<CircleDot/>}</span><span><strong>{item.title}</strong><small>{item.summary||item.event_type} · {relative(item.occurred_at,language)}</small></span></button>)}{!activity.length&&<p>{L.noActivity}</p>}</div></section>
      <section className="project-overview-dashboard__stack"><header><GitBranch/><span><strong>{language==='pt'?'Estado técnico':'Technical state'}</strong><small>{language==='pt'?'Sinais rápidos do repositório e entrega.':'Quick repository and delivery signals.'}</small></span></header><div><span><b>{repo.connected?'OK':'—'}</b><small>{repo.connected?L.repoConnected:L.noRepo}</small></span><span><b>{repo.default_branch||'—'}</b><small>branch</small></span><span><b>{primaryLanguage}</b><small>{language==='pt'?'linguagem principal':'primary language'}</small></span><span><b>{latestEvent?relative(latestEvent.occurred_at,language):'—'}</b><small>{language==='pt'?'última atividade':'last activity'}</small></span></div></section>
    </div>
  </section>
}