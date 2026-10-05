import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Code2,
  ExternalLink,
  Flag,
  GitBranch,
  Plus,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import {
  addProjectUpdate,
  createProject,
  createReport,
  getModerationActions,
  getModerationReports,
  getProject,
  getProjects,
  leaveProject,
  moderatePost,
  moderateTopic,
  requestProjectParticipation,
  reviewProjectMember,
  reviewReport,
  updateProject,
} from './services/extendedApi'

function Shell({ title, onBack, children }) {
  return (
    <section className="community-page community-page-wide">
      <div className="community-page-card">
        <header className="community-page-head">
          <button onClick={onBack}>← Voltar</button>
          <h1>{title}</h1>
        </header>
        {children}
      </div>
    </section>
  )
}

function MiniAvatar({ profile, size = 42 }) {
  const name = profile?.display_name || profile?.username || 'Membro'
  if (profile?.avatar_url) {
    return <img className="community-avatar" src={profile.avatar_url} alt="" style={{ width:size,height:size }} />
  }
  return <span className="community-avatar community-avatar-fallback" style={{ width:size,height:size }}>{name.slice(0,1).toUpperCase()}</span>
}

const reasons = [
  ['spam','Spam'],
  ['abuse','Abuso'],
  ['harassment','Assédio'],
  ['misinformation','Informação enganosa'],
  ['illegal','Conteúdo ilegal'],
  ['privacy','Privacidade'],
  ['other','Outro'],
]

export function ReportButton({ session, targetType, targetId, notify, className = '' }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  if (!session?.user || !targetId) return null

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await createReport({ targetType, targetId, reason, details })
      notify?.('Denúncia enviada para a equipe de moderação.')
      setOpen(false)
      setDetails('')
    } catch (error) {
      notify?.(error?.message?.includes('duplicate') ? 'Você já possui uma denúncia aberta para este conteúdo.' : (error?.message || 'Não foi possível enviar a denúncia.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className={'action report-action ' + className} onClick={() => setOpen(true)}>
        <Flag /> Denunciar
      </button>
      {open && (
        <div className="report-backdrop" onMouseDown={() => setOpen(false)}>
          <form className="report-dialog" onSubmit={submit} onMouseDown={(e)=>e.stopPropagation()}>
            <header><strong>Denunciar conteúdo</strong><button type="button" onClick={()=>setOpen(false)}><X /></button></header>
            <label>Motivo
              <select value={reason} onChange={(e)=>setReason(e.target.value)}>
                {reasons.map(([value,label])=><option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>Detalhes
              <textarea maxLength={2000} value={details} onChange={(e)=>setDetails(e.target.value)} placeholder="Explique brevemente o problema para a equipe de moderação." />
            </label>
            <button className="action primary-action" disabled={busy}>{busy ? 'Enviando...' : 'Enviar denúncia'}</button>
          </form>
        </div>
      )}
    </>
  )
}

const statusLabels = {
  pending:'Pendente',
  reviewing:'Em análise',
  resolved:'Resolvida',
  dismissed:'Dispensada',
}

export function ModerationPage({ profile, session, navigate, notify }) {
  const [status, setStatus] = useState('pending')
  const [reports, setReports] = useState([])
  const [actions, setActions] = useState([])
  const [tab, setTab] = useState('reports')
  const [loading, setLoading] = useState(true)
  const isStaff = ['moderator','admin'].includes(profile?.role)

  async function load() {
    if (!isStaff) return
    setLoading(true)
    try {
      const [nextReports,nextActions] = await Promise.all([
        getModerationReports(status),
        getModerationActions(),
      ])
      setReports(nextReports)
      setActions(nextActions)
    } catch (error) {
      notify?.(error?.message || 'Não foi possível carregar a moderação.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ load() },[status,isStaff])

  if (!session || !isStaff) {
    return <Shell title="Moderação" onBack={()=>navigate('/')}><p className="community-empty">Esta área é restrita à equipe de moderação.</p></Shell>
  }

  async function setReportState(id,next) {
    try {
      await reviewReport(id,next)
      notify?.('Denúncia atualizada.')
      load()
    } catch (error) { notify?.(error?.message || 'Não foi possível atualizar a denúncia.') }
  }

  async function actionOn(report,action) {
    try {
      if (report.target_type === 'topic') await moderateTopic(report.target_id,action,'Ação aplicada a partir da fila de denúncias.')
      else if (report.target_type === 'post' && action === 'delete') await moderatePost(report.target_id,'delete','Ação aplicada a partir da fila de denúncias.')
      else return
      notify?.('Ação de moderação aplicada.')
      load()
    } catch (error) { notify?.(error?.message || 'Não foi possível aplicar a ação.') }
  }

  function openTarget(report) {
    if (report.target_type === 'topic') navigate('/topico/'+report.target_id)
    else if (report.target_type === 'profile') navigate('/membro/'+report.target_id)
    else if (report.target_type === 'project') navigate('/projetos')
  }

  return (
    <Shell title="Central de moderação" onBack={()=>navigate('/')}>
      <div className="moderation-toolbar">
        <button className={tab==='reports'?'active':''} onClick={()=>setTab('reports')}><Flag/>Denúncias</button>
        <button className={tab==='actions'?'active':''} onClick={()=>setTab('actions')}><Shield/>Histórico</button>
      </div>

      {tab === 'reports' && (
        <div className="moderation-content">
          <div className="moderation-filters">
            {['pending','reviewing','resolved','dismissed','all'].map(value=>
              <button className={status===value?'active':''} key={value} onClick={()=>setStatus(value)}>
                {value==='all'?'Todas':statusLabels[value]}
              </button>
            )}
          </div>
          {loading ? <p className="community-empty">Carregando...</p> : reports.map(report=>(
            <article className="report-card" key={report.id}>
              <div className="report-card-head">
                <div>
                  <strong>{report.reason}</strong>
                  <span>{report.target_type} · {statusLabels[report.status] || report.status}</span>
                </div>
                <small>{new Date(report.created_at).toLocaleString('pt-BR')}</small>
              </div>
              <div className="report-reporter">
                <MiniAvatar profile={report.reporter} size={36}/>
                <span>{report.reporter?.display_name || report.reporter?.username || 'Membro'}</span>
              </div>
              {report.details && <p>{report.details}</p>}
              {report.resolution_note && <p className="resolution-note">Nota: {report.resolution_note}</p>}
              <div className="report-actions">
                <button className="action" onClick={()=>openTarget(report)}>Abrir alvo</button>
                {report.status==='pending' && <button className="action" onClick={()=>setReportState(report.id,'reviewing')}>Assumir</button>}
                {!['resolved','dismissed'].includes(report.status) && <button className="action" onClick={()=>setReportState(report.id,'resolved')}><Check/>Resolver</button>}
                {!['resolved','dismissed'].includes(report.status) && <button className="action" onClick={()=>setReportState(report.id,'dismissed')}><X/>Dispensar</button>}
                {report.target_type==='topic' && <>
                  <button className="action" onClick={()=>actionOn(report,'lock')}>Bloquear tópico</button>
                  <button className="action" onClick={()=>actionOn(report,'pin')}>Fixar tópico</button>
                  {profile.role==='admin' && <button className="action danger-action" onClick={()=>actionOn(report,'delete')}>Excluir tópico</button>}
                </>}
                {report.target_type==='post' && <button className="action danger-action" onClick={()=>actionOn(report,'delete')}>Excluir resposta</button>}
              </div>
            </article>
          ))}
          {!loading && !reports.length && <p className="community-empty">Nenhuma denúncia nesta fila.</p>}
        </div>
      )}

      {tab === 'actions' && (
        <div className="moderation-content moderation-history">
          {actions.map(item=>(
            <div key={item.id}>
              <strong>{item.action_type}</strong>
              <span>{item.target_type}{item.target_id ? ' · '+item.target_id : ''}</span>
              <small>{item.moderator?.display_name || item.moderator?.username || 'Equipe'} · {new Date(item.created_at).toLocaleString('pt-BR')}</small>
            </div>
          ))}
          {!actions.length && <p className="community-empty">Nenhuma ação registrada.</p>}
        </div>
      )}
    </Shell>
  )
}

function ProjectStatus({ value }) {
  const labels={idea:'Ideia',planning:'Planejamento',active:'Ativo',paused:'Pausado',completed:'Concluído',archived:'Arquivado'}
  return <span className={'project-status status-'+value}>{labels[value] || value}</span>
}

export function ProjectsPage({ session, navigate, notify }) {
  const [projects,setProjects]=useState([])
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [form,setForm]=useState({title:'',summary:'',description:'',repo_url:'',website_url:'',tags:'',skills_needed:''})

  async function load() {
    try { setProjects(await getProjects()) } catch (error) { notify?.(error?.message || 'Não foi possível carregar os projetos.') }
  }
  useEffect(()=>{ load() },[])

  async function submit(event) {
    event.preventDefault()
    if (!session?.user) return navigate('/entrar')
    setBusy(true)
    try {
      const slug=form.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')+'-'+Date.now().toString(36)
      const created=await createProject({
        owner_id:session.user.id,
        title:form.title.trim(),
        slug,
        summary:form.summary.trim(),
        description:form.description.trim(),
        repo_url:form.repo_url.trim() || null,
        website_url:form.website_url.trim() || null,
        tags:form.tags.split(',').map(v=>v.trim()).filter(Boolean).slice(0,12),
        skills_needed:form.skills_needed.split(',').map(v=>v.trim()).filter(Boolean).slice(0,12),
      })
      notify?.('Projeto criado na CreativeZone.')
      navigate('/projetos/'+created.slug)
    } catch (error) {
      notify?.(error?.message || 'Não foi possível criar o projeto.')
    } finally { setBusy(false) }
  }

  return (
    <Shell title="Projetos Creative Lab" onBack={()=>navigate('/')}>
      <div className="projects-hero">
        <div>
          <span className="about-kicker">CRIE • COLABORE • APRENDA</span>
          <h2>Ideias da comunidade transformadas em projetos reais.</h2>
          <p>Proponha um projeto, encontre pessoas com interesses complementares e construa junto com outros membros da CreativeZone.</p>
        </div>
        <div className="projects-hero-actions">
          {session && <button className="action primary-action" onClick={()=>setOpen(v=>!v)}><Plus/>Novo projeto</button>}
          <a className="action" href="https://github.com/Creatiive-Lab" target="_blank" rel="noreferrer"><GitBranch/>Creatiive-Lab <ExternalLink/></a>
        </div>
      </div>

      {open && (
        <form className="project-form" onSubmit={submit}>
          <label>Nome do projeto<input required minLength={3} maxLength={120} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
          <label>Resumo<input required minLength={10} maxLength={280} value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})}/></label>
          <label>Descrição<textarea maxLength={12000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
          <div className="project-form-grid">
            <label>Repositório GitHub<input type="url" value={form.repo_url} onChange={e=>setForm({...form,repo_url:e.target.value})} placeholder="https://github.com/Creatiive-Lab/..."/></label>
            <label>Site do projeto<input type="url" value={form.website_url} onChange={e=>setForm({...form,website_url:e.target.value})}/></label>
          </div>
          <div className="project-form-grid">
            <label>Tags<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="react, ia, automação"/></label>
            <label>Habilidades procuradas<input value={form.skills_needed} onChange={e=>setForm({...form,skills_needed:e.target.value})} placeholder="frontend, design, documentação"/></label>
          </div>
          <button className="action primary-action" disabled={busy}>{busy?'Criando...':'Criar projeto'}</button>
        </form>
      )}

      <div className="projects-grid">
        {projects.map(project=>(
          <button className="project-card" key={project.id} onClick={()=>navigate('/projetos/'+project.slug)}>
            <div className="project-card-top"><Code2/><ProjectStatus value={project.status}/></div>
            <h3>{project.title}</h3>
            <p>{project.summary}</p>
            <div className="project-tags">{(project.tags||[]).slice(0,5).map(tag=><span key={tag}>{tag}</span>)}</div>
            <footer>
              <span><Users/> {(project.project_members||[]).filter(m=>m.status==='active').length}</span>
              <span>{project.owner?.display_name || project.owner?.username || 'Comunidade'}</span>
            </footer>
          </button>
        ))}
        {!projects.length && <p className="community-empty">Ainda não há projetos. Seja o primeiro a propor uma ideia.</p>}
      </div>
    </Shell>
  )
}

export function ProjectPage({ slug, session, navigate, notify }) {
  const [project,setProject]=useState(null)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [updateText,setUpdateText]=useState('')

  async function load() {
    setLoading(true)
    try { setProject(await getProject(slug)) } catch (error) { notify?.(error?.message || 'Não foi possível carregar o projeto.') }
    finally { setLoading(false) }
  }
  useEffect(()=>{ load() },[slug])

  if (loading) return <Shell title="Projeto" onBack={()=>navigate('/projetos')}><p className="community-empty">Carregando...</p></Shell>
  if (!project) return <Shell title="Projeto" onBack={()=>navigate('/projetos')}><p className="community-empty">Projeto não encontrado.</p></Shell>

  const userId=session?.user?.id
  const membership=(project.project_members||[]).find(m=>m.user_id===userId)
  const isOwner=project.owner_id===userId
  const canManage=isOwner || (membership?.status==='active' && membership?.role==='maintainer')
  const canUpdate=isOwner || (membership?.status==='active' && ['maintainer','contributor'].includes(membership?.role))
  const activeMembers=(project.project_members||[]).filter(m=>m.status==='active')
  const pending=(project.project_members||[]).filter(m=>m.status==='pending')

  async function join(event) {
    event.preventDefault()
    if (!session) return navigate('/entrar')
    try {
      await requestProjectParticipation(project.id,userId,message)
      notify?.('Pedido para participar enviado.')
      setMessage('')
      load()
    } catch (error) { notify?.(error?.message || 'Não foi possível solicitar participação.') }
  }

  async function leave() {
    try { await leaveProject(project.id,userId); notify?.('Você saiu do projeto.'); load() }
    catch (error) { notify?.(error?.message || 'Não foi possível sair do projeto.') }
  }

  async function review(member,status,role='contributor') {
    try { await reviewProjectMember(project.id,member.user_id,status,role); notify?.('Participação atualizada.'); load() }
    catch (error) { notify?.(error?.message || 'Não foi possível atualizar a participação.') }
  }

  async function publishUpdate(event) {
    event.preventDefault()
    if (!updateText.trim()) return
    try { await addProjectUpdate(project.id,userId,updateText.trim()); setUpdateText(''); load() }
    catch (error) { notify?.(error?.message || 'Não foi possível publicar a atualização.') }
  }

  async function changeStatus(value) {
    try { await updateProject(project.id,{status:value}); notify?.('Status do projeto atualizado.'); load() }
    catch (error) { notify?.(error?.message || 'Não foi possível alterar o status.') }
  }

  return (
    <Shell title={project.title} onBack={()=>navigate('/projetos')}>
      <div className="project-detail">
        <section className="project-overview">
          <div className="project-title-row"><ProjectStatus value={project.status}/><span>por {project.owner?.display_name || project.owner?.username || 'Comunidade'}</span></div>
          <p className="project-summary">{project.summary}</p>
          {project.description && <p className="project-description">{project.description}</p>}
          <div className="project-tags">{(project.tags||[]).map(tag=><span key={tag}>{tag}</span>)}</div>
          <div className="project-links">
            {project.repo_url && <a className="action" href={project.repo_url} target="_blank" rel="noreferrer"><GitBranch/>Repositório</a>}
            {project.website_url && <a className="action" href={project.website_url} target="_blank" rel="noreferrer"><ExternalLink/>Site</a>}
          </div>
          {canManage && <div className="project-status-controls">
            {['idea','planning','active','paused','completed'].map(value=><button className="action" key={value} onClick={()=>changeStatus(value)}>{value}</button>)}
          </div>}
        </section>

        <section className="project-members-panel">
          <h3>Membros do projeto</h3>
          <div className="project-member-list">
            {activeMembers.map(member=><div key={member.user_id}><MiniAvatar profile={member.profile} size={36}/><span><strong>{member.profile?.display_name || member.profile?.username}</strong><small>{member.role}</small></span></div>)}
          </div>
          {!isOwner && !membership && session && (
            <form className="join-project-form" onSubmit={join}>
              <textarea maxLength={1000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Conte como você gostaria de contribuir (opcional)."/>
              <button className="action primary-action"><UserPlus/>Quero participar</button>
            </form>
          )}
          {membership?.status==='pending' && <p className="community-empty">Seu pedido de participação está aguardando análise.</p>}
          {membership?.status==='active' && membership.role!=='owner' && <button className="action" onClick={leave}>Sair do projeto</button>}
        </section>

        {canManage && pending.length>0 && (
          <section className="project-pending-panel">
            <h3>Pedidos para participar</h3>
            {pending.map(member=><div key={member.user_id}><MiniAvatar profile={member.profile} size={38}/><span><strong>{member.profile?.display_name || member.profile?.username}</strong><small>{member.message || 'Sem mensagem'}</small></span><div><button className="action" onClick={()=>review(member,'active','contributor')}>Aceitar</button><button className="action" onClick={()=>review(member,'declined')}>Recusar</button></div></div>)}
          </section>
        )}

        <section className="project-updates">
          <h3>Atualizações</h3>
          {canUpdate && <form onSubmit={publishUpdate}><textarea maxLength={5000} value={updateText} onChange={e=>setUpdateText(e.target.value)} placeholder="Compartilhe uma atualização do projeto..."/><button className="action primary-action">Publicar atualização</button></form>}
          <div>{[...(project.project_updates||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(item=><article key={item.id}><strong>{item.author?.display_name || item.author?.username || 'Membro'}</strong><small>{new Date(item.created_at).toLocaleString('pt-BR')}</small><p>{item.content}</p></article>)}</div>
          {!(project.project_updates||[]).length && <p className="community-empty">Nenhuma atualização publicada ainda.</p>}
        </section>
      </div>
    </Shell>
  )
}
