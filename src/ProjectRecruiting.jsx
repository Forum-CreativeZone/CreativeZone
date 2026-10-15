import React,{useEffect,useState} from 'react'
import {
  BadgeCheck,BookOpen,BriefcaseBusiness,Check,ChevronDown,ChevronUp,Code2,
  EyeOff,FileText,Fingerprint,FlaskConical,GitBranch,Globe2,LockKeyhole,Pause,
  Plus,RefreshCw,Search,ShieldCheck,Sparkles,UserCheck,UserPlus,Users,Wrench,X,
} from 'lucide-react'
import {
  applyProjectRecruiting,
  createProjectRecruitingOpening,
  getProjectRecruiting,
  getProjectRecruitingApplications,
  reviewProjectRecruitingApplication,
  updateProjectRecruitingOpening,
  withdrawProjectRecruitingApplication,
} from './services/projectRecruitingApi'
import {supabase} from './services/supabaseClient'
import './ProjectRecruiting.css'

const CATEGORIES={
  design:{label:'UI / Design',icon:Sparkles},
  frontend:{label:'Frontend',icon:Code2},
  backend:{label:'Backend',icon:Wrench},
  fullstack:{label:'Full Stack',icon:BriefcaseBusiness},
  mobile:{label:'Mobile',icon:Code2},
  python:{label:'Python',icon:Code2},
  qa:{label:'QA / Testes',icon:FlaskConical},
  docs:{label:'Documentação',icon:BookOpen},
  security:{label:'Segurança',icon:ShieldCheck},
  devops:{label:'DevOps',icon:GitBranch},
  other:{label:'Outra especialidade',icon:Users},
}
const EMPTY_OPENING={
  title:'',
  category:'frontend',
  summary:'',
  description:'',
  skills:'',
  commitment:'',
  experience:'',
  slots:1,
  visibility:'public',
  status:'open',
}
const EMPTY_APPLICATION={message:'',availability:'',portfolioUrl:''}

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
  return ({open:'Aberta',paused:'Pausada',filled:'Preenchida',closed:'Encerrada'})[value]||value
}
function applicationStatus(value){
  return ({pending:'Em análise',shortlisted:'Pré-selecionado',accepted:'Aceito',rejected:'Encerrado',withdrawn:'Retirada'})[value]||value
}
function splitSkills(value){
  return String(value||'').split(',').map(item=>item.trim()).filter(Boolean).slice(0,20)
}

export function ProjectRecruiting({project,session,navigate,notify}){
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [panelOpen,setPanelOpen]=useState(true)
  const [busy,setBusy]=useState(false)
  const [openingModal,setOpeningModal]=useState(null)
  const [openingForm,setOpeningForm]=useState(EMPTY_OPENING)
  const [applyOpening,setApplyOpening]=useState(null)
  const [application,setApplication]=useState(EMPTY_APPLICATION)
  const [applicationsOpening,setApplicationsOpening]=useState(null)
  const [applications,setApplications]=useState([])
  const [applicationsLoading,setApplicationsLoading]=useState(false)
  const [reviewNotes,setReviewNotes]=useState({})

  async function load(){
    if(!project?.id) return
    try{setData(await getProjectRecruiting(project.id))}
    catch(error){notify?.(error?.message||'Não foi possível carregar as oportunidades do projeto.')}
    finally{setLoading(false)}
  }

  useEffect(()=>{setLoading(true);load()},[project?.id,session?.user?.id])

  useEffect(()=>{
    if(!supabase||!project?.id) return undefined
    const refresh=()=>load()
    const channel=supabase
      .channel('creativezone-project-recruiting-'+project.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'project_recruiting_openings',filter:`project_id=eq.${project.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'project_recruiting_applications',filter:`project_id=eq.${project.id}`},refresh)
      .subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[project?.id])

  const openings=data?.openings||[]
  const permissions=data?.permissions||{}
  const activeOpenings=openings.filter(item=>item.status==='open')
  const isMember=Boolean(
    project?.owner_id===session?.user?.id ||
    (project?.project_members||[]).some(item=>item.user_id===session?.user?.id&&item.status==='active')
  )

  function startCreate(){
    setOpeningForm(EMPTY_OPENING)
    setOpeningModal({mode:'create'})
  }
  function startEdit(opening){
    setOpeningForm({
      title:opening.title||'',
      category:opening.category||'other',
      summary:opening.summary||'',
      description:opening.description||'',
      skills:(opening.skills||[]).join(', '),
      commitment:opening.commitment||'',
      experience:opening.experience||'',
      slots:opening.slots||1,
      visibility:opening.visibility||'public',
      status:opening.status||'open',
    })
    setOpeningModal({mode:'edit',opening})
  }

  async function saveOpening(event){
    event.preventDefault()
    setBusy(true)
    try{
      const payload={...openingForm,skills:splitSkills(openingForm.skills),slots:Number(openingForm.slots)||1}
      if(openingModal?.mode==='edit'){
        await updateProjectRecruitingOpening(openingModal.opening.id,payload)
        notify?.('Oportunidade atualizada.')
      }else{
        await createProjectRecruitingOpening(project.id,payload)
        notify?.('Oportunidade publicada no projeto.')
      }
      setOpeningModal(null)
      await load()
    }catch(error){notify?.(error?.message||'Não foi possível salvar a oportunidade.')}
    finally{setBusy(false)}
  }

  async function quickStatus(opening,status){
    setBusy(true)
    try{
      await updateProjectRecruitingOpening(opening.id,{
        ...opening,
        skills:opening.skills||[],
        status,
      })
      await load()
      notify?.(status==='open'?'Oportunidade reaberta.':status==='paused'?'Oportunidade pausada.':'Oportunidade encerrada.')
    }catch(error){notify?.(error?.message||'Não foi possível alterar a oportunidade.')}
    finally{setBusy(false)}
  }

  function startApply(opening){
    if(!session?.user) return navigate?.('/entrar')
    setApplication(EMPTY_APPLICATION)
    setApplyOpening(opening)
  }

  async function submitApplication(event){
    event.preventDefault()
    if(!applyOpening) return
    setBusy(true)
    try{
      await applyProjectRecruiting(applyOpening.id,application)
      notify?.('Candidatura enviada. O responsável pelo projeto foi avisado.')
      setApplyOpening(null)
      setApplication(EMPTY_APPLICATION)
      await load()
    }catch(error){notify?.(error?.message||'Não foi possível enviar a candidatura.')}
    finally{setBusy(false)}
  }

  async function withdraw(opening){
    const id=opening.my_application?.id
    if(!id||!window.confirm('Retirar sua candidatura desta oportunidade?')) return
    setBusy(true)
    try{
      await withdrawProjectRecruitingApplication(id)
      notify?.('Candidatura retirada.')
      await load()
    }catch(error){notify?.(error?.message||'Não foi possível retirar a candidatura.')}
    finally{setBusy(false)}
  }

  async function openApplications(opening){
    setApplicationsOpening(opening)
    setApplicationsLoading(true)
    try{setApplications(await getProjectRecruitingApplications(opening.id))}
    catch(error){notify?.(error?.message||'Não foi possível carregar as candidaturas.')}
    finally{setApplicationsLoading(false)}
  }

  async function review(app,status){
    setBusy(true)
    try{
      await reviewProjectRecruitingApplication(app.id,status,reviewNotes[app.id]||'')
      notify?.(
        status==='accepted'
          ? 'Candidatura aceita e membro adicionado ao projeto.'
          : status==='shortlisted'
            ? 'Candidato movido para a pré-seleção.'
            : 'Candidatura encerrada.'
      )
      if(applicationsOpening) await openApplications(applicationsOpening)
      await load()
    }catch(error){notify?.(error?.message||'Não foi possível revisar a candidatura.')}
    finally{setBusy(false)}
  }

  if(loading&&!data){
    return <section className="project-recruiting is-loading"><RefreshCw className="security-spin"/>Carregando oportunidades...</section>
  }
  if(!data) return null

  return <section className={'project-recruiting '+(panelOpen?'is-open':'is-collapsed')}>
    <header className="project-recruiting__head">
      <div><UserPlus/><span><small>PRECISO DE AJUDA · RECRUITING</small><strong>Colabore com este projeto</strong><em>{activeOpenings.length?activeOpenings.length+' oportunidade(s) aberta(s)':'Nenhuma oportunidade aberta agora'}</em></span></div>
      <div>
        {permissions.can_manage&&<button type="button" className="action primary-action" onClick={startCreate}><Plus/>Abrir oportunidade</button>}
        <button type="button" className="action" onClick={()=>setPanelOpen(value=>!value)}>{panelOpen?<><ChevronUp/>Minimizar</>:<><ChevronDown/>Expandir</>}</button>
      </div>
    </header>

    {panelOpen&&<>
      {!openings.length&&<div className="project-recruiting__empty">
        <Search/>
        <span><strong>{permissions.can_manage?'Seu projeto precisa de alguém?':'Nenhuma vaga publicada'}</strong><small>{permissions.can_manage?'Abra oportunidades para encontrar designers, developers, QA, documentação, segurança e outras especialidades dentro da comunidade.':'Quando o projeto procurar colaboradores, as oportunidades aparecerão aqui.'}</small></span>
        {permissions.can_manage&&<button type="button" className="action primary-action" onClick={startCreate}><Plus/>Criar primeira oportunidade</button>}
      </div>}

      <div className="project-recruiting__grid">
        {openings.map(opening=>{
          const CategoryIcon=CATEGORIES[opening.category]?.icon||Users
          const mine=opening.my_application
          const canApply=opening.status==='open'&&!permissions.can_manage&&(
            opening.visibility==='team' ? isMember : !isMember
          )
          return <article className={'project-recruiting-card status-'+opening.status} key={opening.id}>
            <header>
              <span className="project-recruiting-card__icon"><CategoryIcon/></span>
              <span><small>{CATEGORIES[opening.category]?.label||opening.category}</small><strong>{opening.title}</strong></span>
              <em>{statusLabel(opening.status)}</em>
            </header>
            {opening.summary&&<p>{opening.summary}</p>}
            <div className="project-recruiting-card__chips">
              {(opening.skills||[]).slice(0,8).map(skill=><span key={skill}>{skill}</span>)}
            </div>
            <div className="project-recruiting-card__facts">
              {opening.commitment&&<span><BriefcaseBusiness/><small>Dedicação</small><b>{opening.commitment}</b></span>}
              {opening.experience&&<span><BadgeCheck/><small>Experiência</small><b>{opening.experience}</b></span>}
              <span><Users/><small>Vagas</small><b>{opening.accepted_count||0}/{opening.slots}</b></span>
              <span>{opening.visibility==='public'?<Globe2/>:<LockKeyhole/>}<small>Visibilidade</small><b>{opening.visibility==='public'?'Pública':'Equipe'}</b></span>
            </div>
            {opening.description&&<details><summary>Sobre a oportunidade</summary><p>{opening.description}</p></details>}
            <footer>
              {mine
                ? <div className={'project-recruiting-card__application status-'+mine.status}><span><strong>{applicationStatus(mine.status)}</strong><small>Enviada {relative(mine.created_at)}{mine.review_note?' · '+mine.review_note:''}</small></span>{['pending','shortlisted'].includes(mine.status)&&<button type="button" className="action" onClick={()=>withdraw(opening)} disabled={busy}>Retirar</button>}</div>
                : canApply
                  ? <button type="button" className="action primary-action" onClick={()=>startApply(opening)}><UserPlus/>Quero contribuir</button>
                  : !session?.user&&opening.status==='open'
                    ? <button type="button" className="action primary-action" onClick={()=>navigate?.('/entrar')}><UserPlus/>Entrar para contribuir</button>
                    : isMember&&opening.visibility==='public'&&<small>Você já faz parte deste projeto.</small>}
              {permissions.can_manage&&<div className="project-recruiting-card__manage">
                <button type="button" className="action" onClick={()=>openApplications(opening)}><Users/>{opening.applications_count||0} candidatura(s)</button>
                <button type="button" className="action" onClick={()=>startEdit(opening)}><FileText/>Editar</button>
                {opening.status==='open'
                  ? <button type="button" className="action" onClick={()=>quickStatus(opening,'paused')}><Pause/>Pausar</button>
                  : opening.status==='paused'
                    ? <button type="button" className="action" onClick={()=>quickStatus(opening,'open')}><Check/>Reabrir</button>
                    : null}
                {!['closed','filled'].includes(opening.status)&&<button type="button" className="action" onClick={()=>quickStatus(opening,'closed')}><X/>Encerrar</button>}
              </div>}
            </footer>
          </article>
        })}
      </div>
    </>}

    {openingModal&&<div className="project-recruiting-modal" onMouseDown={()=>!busy&&setOpeningModal(null)}>
      <form className="project-recruiting-dialog" onSubmit={saveOpening} onMouseDown={event=>event.stopPropagation()}>
        <header><span><UserPlus/><strong>{openingModal.mode==='edit'?'Editar oportunidade':'Abrir oportunidade'}</strong><small>Descreva quem o projeto procura e como essa pessoa pode ajudar.</small></span><button type="button" onClick={()=>setOpeningModal(null)}><X/></button></header>
        <div className="project-recruiting-fields">
          <label className="wide">Função / título<input required minLength={3} maxLength={120} value={openingForm.title} onChange={e=>setOpeningForm({...openingForm,title:e.target.value})} placeholder="React Developer, UI Designer, QA Tester..."/></label>
          <label>Categoria<select value={openingForm.category} onChange={e=>setOpeningForm({...openingForm,category:e.target.value})}>{Object.entries(CATEGORIES).map(([value,row])=><option value={value} key={value}>{row.label}</option>)}</select></label>
          <label>Quantidade de vagas<input type="number" min="1" max="20" value={openingForm.slots} onChange={e=>setOpeningForm({...openingForm,slots:e.target.value})}/></label>
          <label className="wide">Resumo<input maxLength={280} value={openingForm.summary} onChange={e=>setOpeningForm({...openingForm,summary:e.target.value})} placeholder="Ex.: ajudar no sistema de shaders e animações do projeto."/></label>
          <label className="wide">Descrição<textarea maxLength={5000} value={openingForm.description} onChange={e=>setOpeningForm({...openingForm,description:e.target.value})} placeholder="Explique o contexto, o que será desenvolvido e o que a pessoa encontrará na equipe."/></label>
          <label className="wide">Habilidades desejadas<input value={openingForm.skills} onChange={e=>setOpeningForm({...openingForm,skills:e.target.value})} placeholder="React, TypeScript, WebGL, Figma..."/></label>
          <label>Dedicação esperada<input maxLength={180} value={openingForm.commitment} onChange={e=>setOpeningForm({...openingForm,commitment:e.target.value})} placeholder="Ex.: 3–5h por semana"/></label>
          <label>Experiência<input maxLength={180} value={openingForm.experience} onChange={e=>setOpeningForm({...openingForm,experience:e.target.value})} placeholder="Ex.: intermediário ou interesse em aprender"/></label>
          <label>Visibilidade<select value={openingForm.visibility} onChange={e=>setOpeningForm({...openingForm,visibility:e.target.value})}><option value="public">Pública — comunidade</option><option value="team">Somente equipe</option></select></label>
          {openingModal.mode==='edit'&&<label>Status<select value={openingForm.status} onChange={e=>setOpeningForm({...openingForm,status:e.target.value})}><option value="open">Aberta</option><option value="paused">Pausada</option><option value="filled">Preenchida</option><option value="closed">Encerrada</option></select></label>}
        </div>
        <footer><button type="button" className="action" onClick={()=>setOpeningModal(null)}>Cancelar</button><button className="action primary-action" disabled={busy}>{busy?'Salvando...':'Salvar oportunidade'}</button></footer>
      </form>
    </div>}

    {applyOpening&&<div className="project-recruiting-modal" onMouseDown={()=>!busy&&setApplyOpening(null)}>
      <form className="project-recruiting-dialog apply" onSubmit={submitApplication} onMouseDown={event=>event.stopPropagation()}>
        <header><span><UserPlus/><strong>Quero contribuir</strong><small>{applyOpening.title}</small></span><button type="button" onClick={()=>setApplyOpening(null)}><X/></button></header>
        <div className="project-recruiting-apply-note"><Sparkles/><span><strong>Seu Contribution Passport acompanha seu perfil.</strong><small>O responsável poderá consultar sua experiência pública verificada no DevHub; atividades privadas continuam protegidas.</small></span></div>
        <div className="project-recruiting-fields">
          <label className="wide">Mensagem<textarea required maxLength={3000} value={application.message} onChange={e=>setApplication({...application,message:e.target.value})} placeholder="Por que você quer contribuir e como acredita que pode ajudar?"/></label>
          <label>Disponibilidade<input maxLength={240} value={application.availability} onChange={e=>setApplication({...application,availability:e.target.value})} placeholder="Ex.: noites e finais de semana"/></label>
          <label>Portfólio / referência<input type="url" value={application.portfolioUrl} onChange={e=>setApplication({...application,portfolioUrl:e.target.value})} placeholder="https://..."/></label>
        </div>
        <footer><button type="button" className="action" onClick={()=>setApplyOpening(null)}>Cancelar</button><button className="action primary-action" disabled={busy}><UserPlus/>{busy?'Enviando...':'Enviar candidatura'}</button></footer>
      </form>
    </div>}

    {applicationsOpening&&<div className="project-recruiting-modal" onMouseDown={()=>!busy&&setApplicationsOpening(null)}>
      <div className="project-recruiting-dialog applications" onMouseDown={event=>event.stopPropagation()}>
        <header><span><Users/><strong>Candidaturas</strong><small>{applicationsOpening.title}</small></span><button type="button" onClick={()=>setApplicationsOpening(null)}><X/></button></header>
        <div className="project-recruiting-applicants">
          {applicationsLoading
            ? <div className="project-recruiting__loading"><RefreshCw className="security-spin"/>Carregando candidatos...</div>
            : applications.map(app=>{
                const passport=app.passport||{}
                const score=passport.score||{}
                const metrics=passport.metrics||{}
                return <article key={app.id} className={'status-'+app.status}>
                  <header>
                    {app.profile?.avatar_url?<img src={app.profile.avatar_url} alt=""/>:<Users/>}
                    <span><strong>{app.profile?.display_name||app.profile?.username}</strong><small>@{app.profile?.username}{app.profile?.occupation?' · '+app.profile.occupation:''}</small></span>
                    <em>{applicationStatus(app.status)}</em>
                  </header>
                  {app.message&&<p>{app.message}</p>}
                  <div className="project-recruiting-applicant__meta">
                    {app.availability&&<span><BriefcaseBusiness/><small>Disponibilidade</small><b>{app.availability}</b></span>}
                    {app.portfolio_url&&<a href={app.portfolio_url} target="_blank" rel="noreferrer"><Globe2/>Portfólio</a>}
                    <button type="button" onClick={()=>navigate?.('/membro/'+encodeURIComponent(app.profile?.username||''))}><Users/>Ver perfil</button>
                  </div>
                  {!passport.hidden&&passport.score
                    ? <div className="project-recruiting-passport">
                        <Fingerprint/><span><strong>{score.total??0}/100 · {score.level||'Contribution Passport'}</strong><small>{metrics.commits??0} commits · {metrics.reviews??0} reviews · {metrics.merged_pull_requests??0} PRs mergeados · {metrics.projects??0} projetos</small></span>
                      </div>
                    : passport.hidden&&<div className="project-recruiting-passport private"><EyeOff/><span><strong>Contribution Passport privado</strong><small>O membro ocultou sua atividade pública.</small></span></div>}
                  {(app.profile?.skills||[]).length>0&&<div className="project-recruiting-card__chips">{app.profile.skills.slice(0,8).map(skill=><span key={skill}>{skill}</span>)}</div>}
                  {['pending','shortlisted'].includes(app.status)&&<div className="project-recruiting-review">
                    <input maxLength={2000} value={reviewNotes[app.id]||''} onChange={e=>setReviewNotes({...reviewNotes,[app.id]:e.target.value})} placeholder="Nota para o candidato (opcional)"/>
                    <div>
                      {app.status==='pending'&&<button type="button" className="action" disabled={busy} onClick={()=>review(app,'shortlisted')}><Search/>Pré-selecionar</button>}
                      <button type="button" className="action primary-action" disabled={busy} onClick={()=>review(app,'accepted')}><UserCheck/>Aceitar</button>
                      <button type="button" className="action" disabled={busy} onClick={()=>review(app,'rejected')}><X/>Recusar</button>
                    </div>
                  </div>}
                  {app.review_note&&<small className="project-recruiting-review-note">Nota: {app.review_note}</small>}
                </article>
              })}
          {!applicationsLoading&&!applications.length&&<p className="project-recruiting__empty-text">Ainda não há candidaturas.</p>}
        </div>
      </div>
    </div>}
  </section>
}
