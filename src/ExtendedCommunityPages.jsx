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
  getReportTargetPath,
  getProject,
  getProjects,
  leaveProject,
  moderatePost,
  moderateTopic,
  moderateChatMessage,
  requestProjectParticipation,
  reviewProjectMember,
  reviewReport,
  updateProject,
  updateProjectStatus,
} from './services/extendedApi'
import { LinkPreviewCard } from './LinkPreview'
import { ProjectSecurityPanel, SecurityScoreBadge } from './SecurityAudit'
import { GitHubRepositoryPanel, GitHubCommunityOrganization } from './GitHubDevHub'
import { ProjectStudio } from './ProjectStudio'
import { GitHubAccountConnect } from './GitHubAccountConnect'
import { createGitHubRepositoryForProject, getGitHubAccountStatus } from './services/githubAuthApi'
import { requestGitHubOrganizationMembership, syncGitHubProject } from './services/githubApi'
import { trackEvent } from './services/analytics'

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
      else if (report.target_type === 'chat_message') await moderateChatMessage(report.target_id,action,'Ação aplicada a partir da fila de denúncias do chat.')
      else return
      notify?.('Ação de moderação aplicada.')
      load()
    } catch (error) { notify?.(error?.message || 'Não foi possível aplicar a ação.') }
  }

  async function openTarget(report) {
    try {
      const targetPath = await getReportTargetPath(report)
      if (!targetPath) {
        notify?.('O conteúdo denunciado não está mais disponível.')
        return
      }
      if (report.target_type === 'chat_message') {
        try { sessionStorage.setItem('creativezone-chat-focus', report.target_id) } catch {}
      }
      navigate(targetPath)
    } catch (error) {
      notify?.(error?.message || 'Não foi possível abrir o conteúdo denunciado.')
    }
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
              {report.target_type === 'chat_message' && (
                <div className="resolution-note">
                  <strong>Mensagem denunciada:</strong>{' '}
                  {report.target_preview?.deleted_at
                    ? 'Mensagem removida.'
                    : report.target_preview?.content || 'Mensagem não disponível.'}
                  {report.target_preview?.author && (
                    <small>
                      {' '}— {report.target_preview.author.display_name || report.target_preview.author.username}
                    </small>
                  )}
                </div>
              )}
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
                {report.target_type==='chat_message' && <>
                  <button className="action danger-action" onClick={()=>actionOn(report,'delete')}>Excluir mensagem</button>
                  <button className="action" onClick={()=>actionOn(report,'mute_10m')}>Silenciar 10 min</button>
                  <button className="action" onClick={()=>actionOn(report,'mute_1h')}>Silenciar 1 hora</button>
                  <button className="action danger-action" onClick={()=>actionOn(report,'ban')}>Banir do chat</button>
                </>}
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

function projectSecurityState(project) {
  const value = project?.project_security_state
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function ProjectStatus({ value }) {
  const labels={idea:'Ideia',planning:'Planejamento',active:'Ativo',paused:'Pausado',completed:'Concluído',archived:'Arquivado'}
  return <span className={'project-status status-'+value}>{labels[value] || value}</span>
}

export function ProjectsPage({ session, navigate, notify }) {
  const [projects,setProjects]=useState([])
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [form,setForm]=useState({
    title:'',summary:'',description:'',repo_url:'',website_url:'',tags:'',skills_needed:'',
    repo_mode:'none',repo_name:'',repo_private:false,gitignore_template:'',license_template:''
  })

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
        repo_url:form.repo_mode==='existing' ? (form.repo_url.trim() || null) : null,
        website_url:form.website_url.trim() || null,
        tags:form.tags.split(',').map(v=>v.trim()).filter(Boolean).slice(0,12),
        skills_needed:form.skills_needed.split(',').map(v=>v.trim()).filter(Boolean).slice(0,12),
      })

      if(form.repo_mode==='existing' && form.repo_url.trim()){
        try{
          await syncGitHubProject(created.id)
          notify?.('Projeto criado e repositório existente conectado ao CreativeZone DevHub.')
        }catch(syncError){
          const account=await getGitHubAccountStatus().catch(()=>null)
          if(form.repo_url.includes('github.com/Creatiive-Zone/') && account?.connected){
            try{
              await requestGitHubOrganizationMembership(
                account.connection?.github_username || '',
                'Quero participar da organização para colaborar no repositório '+form.repo_url.trim()+'.'
              )
              notify?.('Projeto criado. O repositório foi registrado e seu pedido para colaborar na organização foi enviado.')
            }catch{
              notify?.('Projeto criado. O repositório foi registrado, mas o DevHub ainda precisa de acesso da organização para sincronizá-lo.')
            }
          }else{
            notify?.(syncError?.message || 'Projeto criado, mas o repositório existente ainda não pôde ser sincronizado.')
          }
        }
      }

      if(['personal','organization'].includes(form.repo_mode)){
        const account=await getGitHubAccountStatus()
        if(!account?.connected){
          notify?.('Projeto criado. Conecte sua conta GitHub para criar o repositório pelo DevHub.')
          navigate('/projetos/'+created.slug)
          return
        }

        const repository=await createGitHubRepositoryForProject(created.id,{
          target:form.repo_mode,
          name:(form.repo_name || form.title).trim().replace(/\s+/g,'-'),
          description:form.summary.trim(),
          private:Boolean(form.repo_private),
          auto_init:true,
          gitignore_template:form.gitignore_template || undefined,
          license_template:form.license_template || undefined,
        })

        if(repository?.needs_organization_membership){
          try{
            await requestGitHubOrganizationMembership(
              account.connection?.github_username || '',
              'Quero participar da organização para criar e colaborar no projeto “'+form.title.trim()+'”.'
            )
            notify?.('Projeto criado e pedido para participar da organização enviado. O repositório poderá ser criado após sua entrada na Creatiive-Zone.')
          }catch{
            notify?.('Projeto criado. Solicite participação na organização CreativeZone para criar o repositório nela.')
          }
          navigate('/projetos/'+created.slug)
          return
        }
      }

      notify?.('Projeto criado na CreativeZone'+(['personal','organization'].includes(form.repo_mode)?' e repositório criado no GitHub.':'.'))
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
          <button className="action" type="button" onClick={()=>document.querySelector('.github-community-hub')?.scrollIntoView({behavior:'smooth',block:'start'})}><GitBranch/>Organização CreativeZone</button>
        </div>
      </div>

      <GitHubAccountConnect session={session} notify={notify} />
      <GitHubCommunityOrganization
        session={session}
        navigate={navigate}
        notify={notify}
        onUseRepository={(repo)=>{
          setOpen(true)
          setForm(current=>({
            ...current,
            repo_mode:'existing',
            repo_url:repo?.html_url || '',
            title:current.title || repo?.name || '',
            summary:current.summary || repo?.description || ('Projeto colaborativo '+(repo?.name || '')+' da organização CreativeZone.'),
          }))
          setTimeout(()=>document.querySelector('.project-form')?.scrollIntoView({behavior:'smooth',block:'start'}),30)
        }}
      />

      {open && (
        <form className="project-form" onSubmit={submit}>
          <label>Nome do projeto<input required minLength={3} maxLength={120} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
          <label>Resumo<input required minLength={10} maxLength={280} value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})}/></label>
          <label>Descrição<textarea maxLength={12000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
          <section className="project-repository-creator">
            <header><GitBranch/><span><strong>GitHub DevHub</strong><small>Escolha onde o repositório será criado. O GitHub fica sincronizado por trás do fórum.</small></span></header>
            <div className="project-repo-mode-grid">
              <label className={form.repo_mode==='none'?'selected':''}><input type="radio" name="repo-mode" checked={form.repo_mode==='none'} onChange={()=>setForm({...form,repo_mode:'none'})}/><span><strong>Sem repositório agora</strong><small>Você pode conectar depois.</small></span></label>
              <label className={form.repo_mode==='personal'?'selected':''}><input type="radio" name="repo-mode" checked={form.repo_mode==='personal'} onChange={()=>setForm({...form,repo_mode:'personal'})}/><span><strong>Meu GitHub</strong><small>Criar no perfil GitHub conectado.</small></span></label>
              <label className={form.repo_mode==='organization'?'selected':''}><input type="radio" name="repo-mode" checked={form.repo_mode==='organization'} onChange={()=>setForm({...form,repo_mode:'organization'})}/><span><strong>Organização CreativeZone</strong><small>Criar em @Creatiive-Zone. Se ainda não for membro, o fórum abre o pedido de participação.</small></span></label>
              <label className={form.repo_mode==='existing'?'selected':''}><input type="radio" name="repo-mode" checked={form.repo_mode==='existing'} onChange={()=>setForm({...form,repo_mode:'existing'})}/><span><strong>Repositório existente</strong><small>Conectar um projeto que já existe.</small></span></label>
            </div>
            {['personal','organization'].includes(form.repo_mode) && <div className="project-form-grid">
              <label>Nome do repositório<input value={form.repo_name} onChange={e=>setForm({...form,repo_name:e.target.value})} placeholder={form.title?form.title.trim().replace(/\s+/g,'-'):'meu-projeto'}/></label>
              <label className="project-private-toggle"><input type="checkbox" checked={form.repo_private} onChange={e=>setForm({...form,repo_private:e.target.checked})}/><span>Repositório privado</span></label>
              <label>.gitignore
                <select value={form.gitignore_template} onChange={e=>setForm({...form,gitignore_template:e.target.value})}>
                  <option value="">Nenhum</option><option value="Node">Node</option><option value="Python">Python</option><option value="VisualStudio">Visual Studio</option><option value="Unity">Unity</option>
                </select>
              </label>
              <label>Licença
                <select value={form.license_template} onChange={e=>setForm({...form,license_template:e.target.value})} disabled={form.repo_private}>
                  <option value="">Nenhuma</option><option value="mit">MIT</option><option value="apache-2.0">Apache 2.0</option><option value="gpl-3.0">GPL 3.0</option>
                </select>
              </label>
            </div>}
            {form.repo_mode==='existing' && <label>URL do repositório GitHub<input type="url" value={form.repo_url} onChange={e=>setForm({...form,repo_url:e.target.value})} placeholder="https://github.com/usuario/repositorio"/></label>}
          </section>
          <div className="project-form-grid">
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
            <div className="project-card-top">
              <Code2/>
              <ProjectStatus value={project.status}/>
              {project.repo_url && <SecurityScoreBadge state={projectSecurityState(project)} compact />}
            </div>
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
  const canStudio=canUpdate
  const activeMembers=(project.project_members||[]).filter(m=>m.status==='active')
  const pending=(project.project_members||[]).filter(m=>m.status==='pending')

  async function join(event) {
    event.preventDefault()
    if (!session) return navigate('/entrar')
    try {
      await requestProjectParticipation(project.id,userId,message)
      trackEvent('join_project')
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
    try { await updateProjectStatus(project.id,value); notify?.('Status do projeto atualizado.'); load() }
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
            {project.repo_url && <span className="action project-devhub-connected"><GitBranch/>DevHub conectado</span>}
            {project.website_url && <a className="action" href={project.website_url} target="_blank" rel="noreferrer"><ExternalLink/>Site</a>}
            {!isOwner && session && (
              <ReportButton
                session={session}
                targetType="project"
                targetId={project.id}
                notify={notify}
              />
            )}
          </div>
          {project.website_url && (
            <div className="project-website-preview">
              <LinkPreviewCard url={project.website_url} variant="project" eager />
            </div>
          )}

          <GitHubRepositoryPanel
            project={project}
            canManage={canManage}
            notify={notify}
            onChanged={load}
          />

          <ProjectStudio
            project={project}
            canManage={canStudio}
            notify={notify}
          />

          <ProjectSecurityPanel
            project={{ ...project, project_security_state: projectSecurityState(project) }}
            canManage={canManage}
            notify={notify}
            onChanged={load}
          />

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
