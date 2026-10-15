import React,{useEffect,useMemo,useState} from 'react'
import {
  Check,ChevronDown,Crown,FolderCog,KeyRound,Mail,RefreshCw,Search,
  ShieldCheck,UserCheck,UserPlus,Users,X,
} from 'lucide-react'
import {
  cancelProjectMemberInvite,
  createProjectMemberInvite,
  getProjectTeamAccess,
  respondProjectMemberInvite,
  reviewProjectMember,
  requestProjectParticipation,
  leaveProject,
  searchProjectInviteCandidates,
  setProjectMemberAccess,
} from './services/extendedApi'
import './ProjectTeamPermissions.css'

const EDITABLE_ROLES=['maintainer','developer','reviewer','designer','member','viewer']

function roleLabel(role,row,language){
  if(row) return language==='pt'?row.label_pt:row.label_en
  const fallback={
    owner:{pt:'Responsável',en:'Owner'},
    maintainer:{pt:'Maintainer',en:'Maintainer'},
    developer:{pt:'Developer',en:'Developer'},
    reviewer:{pt:'Reviewer',en:'Reviewer'},
    designer:{pt:'Designer',en:'Designer'},
    member:{pt:'Membro',en:'Member'},
    viewer:{pt:'Visualizador',en:'Viewer'},
  }
  return fallback[role]?.[language]||role
}
function splitPaths(value){
  return String(value||'').split(',').map(item=>item.trim().replace(/^\/+|\/+$/g,'')).filter(Boolean).slice(0,40)
}
function permissionCell(role,caps={},type,language){
  const pt=language==='pt'
  if(type==='code'){
    if(caps.code_write) return role==='designer'?(pt?'Arquivos autorizados':'Authorized files'):(pt?'Editar':'Edit')
    return caps.code_read?(pt?'Ler':'Read'):'—'
  }
  if(type==='issues'){
    if(caps.issues_manage) return pt?'Gerenciar':'Manage'
    if(caps.issues_create) return pt?'Criar':'Create'
    if(caps.issues_comment) return pt?'Comentar':'Comment'
    return caps.issues_read?(pt?'Ler':'Read'):'—'
  }
  if(type==='prs'){
    if(caps.prs_merge) return 'Merge'
    if(caps.prs_review) return pt?'Revisar':'Review'
    if(caps.prs_create) return pt?'Criar':'Create'
    if(caps.prs_comment) return pt?'Comentar':'Comment'
    return caps.prs_read?(pt?'Ler':'Read'):'—'
  }
  if(type==='kanban'){
    if(caps.kanban_manage) return pt?'Total':'Full'
    if(caps.kanban_write) return pt?'Editar':'Edit'
    if(caps.kanban_participate) return pt?'Participar':'Participate'
    return caps.kanban_read?(pt?'Ler':'Read'):'—'
  }
  if(type==='team'){
    if(caps.team_manage_roles) return pt?'Total':'Full'
    if(caps.team_invite) return pt?'Convidar':'Invite'
    return '—'
  }
  if(type==='settings'){
    if(caps.destructive) return pt?'Total':'Full'
    if(caps.settings_manage) return pt?'Limitada':'Limited'
    return '—'
  }
  return '—'
}

export function ProjectTeamPermissions({project,session,language='pt',notify,onChanged}){
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [drafts,setDrafts]=useState({})
  const [inviteOpen,setInviteOpen]=useState(false)
  const [query,setQuery]=useState('')
  const [candidates,setCandidates]=useState([])
  const [searching,setSearching]=useState(false)
  const [selected,setSelected]=useState(null)
  const [invite,setInvite]=useState({role:'member',message:'',operationalAccess:false,allowedPaths:''})
  const [pendingRoles,setPendingRoles]=useState({})
  const [joinMessage,setJoinMessage]=useState('')

  async function load(){
    if(!project?.id) return
    setLoading(true)
    try{
      const next=await getProjectTeamAccess(project.id)
      setData(next)
      const nextDrafts={}
      ;(next?.members||[]).forEach(member=>{
        nextDrafts[member.user_id]={
          role:member.role,
          operationalAccess:Boolean(member.operational_access),
          allowedPaths:(member.allowed_paths||[]).join(', '),
        }
      })
      setDrafts(nextDrafts)
    }catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível carregar as permissões da equipe.':'Could not load team permissions.'))}
    finally{setLoading(false)}
  }

  useEffect(()=>{load()},[project?.id,session?.user?.id])

  const roles=data?.roles||[]
  const roleMap=useMemo(()=>Object.fromEntries(roles.map(row=>[row.role,row])),[roles])
  const activeMembers=(data?.members||[]).filter(item=>item.status==='active')
  const pendingMembers=(data?.members||[]).filter(item=>item.status==='pending')
  const canManage=Boolean(data?.can_manage_roles)
  const canInvite=Boolean(data?.can_invite)

  async function saveMember(member){
    const draft=drafts[member.user_id]
    if(!draft) return
    setBusy(true)
    try{
      await setProjectMemberAccess(
        project.id,
        member.user_id,
        draft.role,
        draft.operationalAccess,
        draft.role==='designer'&&!draft.operationalAccess?splitPaths(draft.allowedPaths):[],
      )
      notify?.(language==='pt'?'Função e permissões atualizadas.':'Role and permissions updated.')
      await load()
      onChanged?.()
    }catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível atualizar o membro.':'Could not update member.'))}
    finally{setBusy(false)}
  }

  async function search(){
    setSearching(true)
    try{setCandidates(await searchProjectInviteCandidates(project.id,query))}
    catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível buscar membros.':'Could not search members.'))}
    finally{setSearching(false)}
  }

  async function sendInvite(event){
    event.preventDefault()
    if(!selected) return
    setBusy(true)
    try{
      await createProjectMemberInvite(project.id,selected.id,{
        role:invite.role,
        message:invite.message,
        operationalAccess:canManage&&invite.operationalAccess,
        allowedPaths:invite.role==='designer'&&!invite.operationalAccess?splitPaths(invite.allowedPaths):[],
      })
      notify?.(language==='pt'?'Convite enviado no fórum e por e-mail.':'Invitation sent in the forum and by email.')
      setInviteOpen(false);setSelected(null);setCandidates([]);setQuery('')
      setInvite({role:'member',message:'',operationalAccess:false,allowedPaths:''})
      await load()
    }catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível enviar o convite.':'Could not send invitation.'))}
    finally{setBusy(false)}
  }

  async function respondInvite(accept){
    const id=data?.my_invite?.id
    if(!id) return
    setBusy(true)
    try{
      await respondProjectMemberInvite(id,accept)
      notify?.(accept?(language==='pt'?'Convite aceito.':'Invitation accepted.'):(language==='pt'?'Convite recusado.':'Invitation declined.'))
      await load();onChanged?.()
    }catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível responder ao convite.':'Could not respond to invitation.'))}
    finally{setBusy(false)}
  }

  async function reviewPending(member,status){
    setBusy(true)
    try{
      await reviewProjectMember(project.id,member.user_id,status,pendingRoles[member.user_id]||'member')
      notify?.(language==='pt'?'Solicitação atualizada.':'Request updated.')
      await load();onChanged?.()
    }catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível revisar a solicitação.':'Could not review request.'))}
    finally{setBusy(false)}
  }

  async function cancelInvite(id){
    setBusy(true)
    try{await cancelProjectMemberInvite(id);await load()}
    catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível cancelar o convite.':'Could not cancel invitation.'))}
    finally{setBusy(false)}
  }

  async function requestJoin(event){
    event.preventDefault()
    if(!session?.user) return
    setBusy(true)
    try{
      await requestProjectParticipation(project.id,session.user.id,joinMessage.trim())
      setJoinMessage('')
      notify?.(language==='pt'?'Pedido para participar enviado.':'Participation request sent.')
      await load();onChanged?.()
    }catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível solicitar participação.':'Could not request participation.'))}
    finally{setBusy(false)}
  }

  async function leave(){
    if(!session?.user||!window.confirm(language==='pt'?'Sair deste projeto?':'Leave this project?')) return
    setBusy(true)
    try{
      await leaveProject(project.id,session.user.id)
      notify?.(language==='pt'?'Você saiu do projeto.':'You left the project.')
      await load();onChanged?.()
    }catch(error){notify?.(error?.message||(language==='pt'?'Não foi possível sair do projeto.':'Could not leave project.'))}
    finally{setBusy(false)}
  }

  if(loading&&!data){
    return <section className="project-team-access loading"><RefreshCw className="security-spin"/><span>{language==='pt'?'Carregando funções e permissões...':'Loading roles and permissions...'}</span></section>
  }
  if(!data) return null

  return <section className="project-team-access">
    <header className="project-team-access__head">
      <div><ShieldCheck/><span><small>CREATIVEZONE DEVHUB</small><strong>{language==='pt'?'Equipe e permissões':'Team & permissions'}</strong><em>{language==='pt'?'Acesso aplicado no backend, não apenas na interface.':'Access is enforced by the backend, not only the UI.'}</em></span></div>
      <div>{canInvite&&<button type="button" className="action primary-action" onClick={()=>setInviteOpen(value=>!value)}><UserPlus/>{language==='pt'?'Convidar membro':'Invite member'}</button>}<button type="button" className="action" onClick={load}><RefreshCw/>{language==='pt'?'Atualizar':'Refresh'}</button></div>
    </header>

    {session?.user&&data.current?.role==='none'&&!data.my_invite&&<form className="project-team-join" onSubmit={requestJoin}>
      <UserPlus/><span><strong>{language==='pt'?'Quer fazer parte deste projeto?':'Want to join this project?'}</strong><small>{language==='pt'?'Envie uma mensagem para os responsáveis escolherem sua função.':'Send a message so the project leads can choose your role.'}</small></span>
      <input maxLength={1000} value={joinMessage} onChange={e=>setJoinMessage(e.target.value)} placeholder={language==='pt'?'Como você quer contribuir?':'How would you like to contribute?'}/>
      <button className="action primary-action" disabled={busy}><UserPlus/>{language==='pt'?'Solicitar participação':'Request access'}</button>
    </form>}

    {session?.user&&data.current?.role!=='none'&&data.current?.role!=='owner'&&<div className="project-team-current-role">
      <ShieldCheck/><span><strong>{language==='pt'?'Seu acesso atual':'Your current access'}</strong><small>{roleLabel(data.current.role,roleMap[data.current.role],language)}{data.current.operational_access?' · '+(language==='pt'?'poder operacional total':'full operational access'):''}</small></span>
      <button type="button" className="action" disabled={busy} onClick={leave}>{language==='pt'?'Sair do projeto':'Leave project'}</button>
    </div>}

    {data.my_invite&&<div className="project-team-invite-banner">
      <Mail/><span><strong>{language==='pt'?'Você recebeu um convite para este projeto':'You were invited to this project'}</strong><small>{language==='pt'?'Função':'Role'}: {roleLabel(data.my_invite.role,roleMap[data.my_invite.role],language)}{data.my_invite.message?' · '+data.my_invite.message:''}</small></span>
      <button type="button" className="action primary-action" disabled={busy} onClick={()=>respondInvite(true)}><Check/>{language==='pt'?'Aceitar':'Accept'}</button>
      <button type="button" className="action" disabled={busy} onClick={()=>respondInvite(false)}><X/>{language==='pt'?'Recusar':'Decline'}</button>
    </div>}

    {inviteOpen&&canInvite&&<form className="project-team-invite-box" onSubmit={sendInvite}>
      <header><UserPlus/><span><strong>{language==='pt'?'Convidar para o projeto':'Invite to project'}</strong><small>{language==='pt'?'Escolha a pessoa, a função e uma mensagem.':'Choose the person, role and a message.'}</small></span></header>
      <div className="project-team-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={language==='pt'?'Buscar por nome ou @usuário':'Search name or @username'}/><button type="button" className="action" onClick={search} disabled={searching}><Search/>{searching?'...':(language==='pt'?'Buscar':'Search')}</button></div>
      {candidates.length>0&&<div className="project-team-candidates">{candidates.map(candidate=><button type="button" key={candidate.id} className={selected?.id===candidate.id?'active':''} onClick={()=>setSelected(candidate)}>{candidate.avatar_url?<img src={candidate.avatar_url} alt=""/>:<Users/>}<span><strong>{candidate.display_name||candidate.username}</strong><small>@{candidate.username}{candidate.occupation?' · '+candidate.occupation:''}</small></span>{selected?.id===candidate.id&&<Check/>}</button>)}</div>}
      {selected&&<div className="project-team-invite-fields">
        <label>{language==='pt'?'Função':'Role'}<select value={invite.role} onChange={e=>setInvite({...invite,role:e.target.value})}>{EDITABLE_ROLES.filter(role=>canManage||role!=='maintainer').map(role=><option value={role} key={role}>{roleLabel(role,roleMap[role],language)}</option>)}</select></label>
        {canManage&&<label className="project-team-operational"><input type="checkbox" checked={invite.operationalAccess} onChange={e=>setInvite({...invite,operationalAccess:e.target.checked})}/><span><strong>{language==='pt'?'Poder operacional total':'Full operational access'}</strong><small>{language==='pt'?'Libera operações avançadas, mas não ações destrutivas de propriedade.':'Unlocks advanced operations, but not destructive ownership actions.'}</small></span></label>}
        {invite.role==='designer'&&!invite.operationalAccess&&<label className="wide">{language==='pt'?'Arquivos/pastas autorizados':'Authorized files/folders'}<input value={invite.allowedPaths} onChange={e=>setInvite({...invite,allowedPaths:e.target.value})} placeholder="assets, public, src/assets, docs"/></label>}
        <label className="wide">{language==='pt'?'Mensagem':'Message'}<textarea maxLength={2000} value={invite.message} onChange={e=>setInvite({...invite,message:e.target.value})} placeholder={language==='pt'?'Ex.: Quero você trabalhando no sistema de shaders.':'Example: I want you working on the shader system.'}/></label>
        <button className="action primary-action" disabled={busy}><Mail/>{busy?(language==='pt'?'Enviando...':'Sending...'):(language==='pt'?'Enviar convite':'Send invitation')}</button>
      </div>}
    </form>}

    <section className="project-role-matrix">
      <header><KeyRound/><span><strong>{language==='pt'?'Matriz de funções':'Role matrix'}</strong><small>{language==='pt'?'O que cada função pode fazer no DevHub.':'What each role can do in DevHub.'}</small></span></header>
      <div className="project-role-matrix__table">
        <div className="head"><span>{language==='pt'?'Função':'Role'}</span><span>{language==='pt'?'Código':'Code'}</span><span>Issues</span><span>PR</span><span>Kanban</span><span>{language==='pt'?'Equipe':'Team'}</span><span>{language==='pt'?'Configuração':'Settings'}</span></div>
        {roles.map(row=><div className="row" key={row.role}><span><strong>{roleLabel(row.role,row,language)}</strong><small>{language==='pt'?row.description_pt:row.description_en}</small></span><span>{permissionCell(row.role,row.capabilities,'code',language)}</span><span>{permissionCell(row.role,row.capabilities,'issues',language)}</span><span>{permissionCell(row.role,row.capabilities,'prs',language)}</span><span>{permissionCell(row.role,row.capabilities,'kanban',language)}</span><span>{permissionCell(row.role,row.capabilities,'team',language)}</span><span>{permissionCell(row.role,row.capabilities,'settings',language)}</span></div>)}
      </div>
    </section>

    <section className="project-team-members">
      <header><Users/><span><strong>{language==='pt'?'Membros ativos':'Active members'}</strong><small>{activeMembers.length} {language==='pt'?'pessoa(s) na equipe':'team member(s)'}</small></span></header>
      <div>{activeMembers.map(member=>{
        const draft=drafts[member.user_id]||{role:member.role,operationalAccess:false,allowedPaths:''}
        const isOwner=member.role==='owner'
        return <article key={member.user_id}>
          {member.profile?.avatar_url?<img src={member.profile.avatar_url} alt=""/>:<Users/>}
          <span className="identity"><strong>{member.profile?.display_name||member.profile?.username}</strong><small>@{member.profile?.username}{member.profile?.occupation?' · '+member.profile.occupation:''}</small><em>{roleLabel(member.role,roleMap[member.role],language)}{member.operational_access?' · '+(language==='pt'?'acesso operacional':'operational access'):''}</em></span>
          {canManage&&!isOwner?<div className="project-team-member-controls">
            <select value={draft.role} onChange={e=>setDrafts({...drafts,[member.user_id]:{...draft,role:e.target.value,operationalAccess:e.target.value==='maintainer'?false:draft.operationalAccess}})}>{EDITABLE_ROLES.map(role=><option value={role} key={role}>{roleLabel(role,roleMap[role],language)}</option>)}</select>
            <label><input type="checkbox" checked={Boolean(draft.operationalAccess)} disabled={draft.role==='maintainer'} onChange={e=>setDrafts({...drafts,[member.user_id]:{...draft,operationalAccess:e.target.checked}})}/><span>{language==='pt'?'Acesso operacional':'Operational access'}</span></label>
            {draft.role==='designer'&&!draft.operationalAccess&&<input value={draft.allowedPaths} onChange={e=>setDrafts({...drafts,[member.user_id]:{...draft,allowedPaths:e.target.value}})} placeholder="assets, public, src/assets"/>}
            <button type="button" className="action" disabled={busy} onClick={()=>saveMember(member)}><UserCheck/>{language==='pt'?'Salvar':'Save'}</button>
          </div>:<span className="project-team-role-chip">{roleLabel(member.role,roleMap[member.role],language)}</span>}
        </article>
      })}</div>
    </section>

    {pendingMembers.length>0&&canInvite&&<section className="project-team-pending">
      <header><UserPlus/><span><strong>{language==='pt'?'Pedidos para participar':'Participation requests'}</strong><small>{pendingMembers.length} {language==='pt'?'aguardando análise':'awaiting review'}</small></span></header>
      <div>{pendingMembers.map(member=><article key={member.user_id}>{member.profile?.avatar_url?<img src={member.profile.avatar_url} alt=""/>:<Users/>}<span><strong>{member.profile?.display_name||member.profile?.username}</strong><small>{member.message||'—'}</small></span><select value={pendingRoles[member.user_id]||'member'} onChange={e=>setPendingRoles({...pendingRoles,[member.user_id]:e.target.value})}>{EDITABLE_ROLES.filter(role=>canManage||role!=='maintainer').map(role=><option value={role} key={role}>{roleLabel(role,roleMap[role],language)}</option>)}</select><button type="button" className="action primary-action" disabled={busy} onClick={()=>reviewPending(member,'active')}><Check/>{language==='pt'?'Aceitar':'Accept'}</button><button type="button" className="action" disabled={busy} onClick={()=>reviewPending(member,'declined')}><X/>{language==='pt'?'Recusar':'Decline'}</button></article>)}</div>
    </section>}

    {(data.invites||[]).length>0&&canInvite&&<section className="project-team-pending">
      <header><Mail/><span><strong>{language==='pt'?'Convites pendentes':'Pending invitations'}</strong><small>{data.invites.length}</small></span></header>
      <div>{data.invites.map(item=><article key={item.id}>{item.profile?.avatar_url?<img src={item.profile.avatar_url} alt=""/>:<Users/>}<span><strong>{item.profile?.display_name||item.profile?.username}</strong><small>{roleLabel(item.role,roleMap[item.role],language)}{item.message?' · '+item.message:''}</small></span>{item.operational_access&&<em className="project-team-operational-chip"><Crown/>{language==='pt'?'Operacional':'Operational'}</em>}<button type="button" className="action" disabled={busy} onClick={()=>cancelInvite(item.id)}><X/>{language==='pt'?'Cancelar':'Cancel'}</button></article>)}</div>
    </section>}

    <footer className="project-team-access__note"><FolderCog/><span><strong>{language==='pt'?'Designer com escopo de arquivos':'Designer file scope'}</strong><small>{language==='pt'?'A escrita de Designers é validada no backend por caminhos autorizados. Acesso operacional ignora essa limitação, mas continua sem ações destrutivas de propriedade.':'Designer write access is validated by authorized paths on the backend. Operational access bypasses that scope but still excludes destructive ownership actions.'}</small></span></footer>
  </section>
}
