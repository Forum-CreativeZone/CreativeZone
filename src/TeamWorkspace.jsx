import React,{useEffect,useState} from 'react'
import {
  ArrowLeft,Check,Eye,EyeOff,LockKeyhole,MessageSquare,Plus,Send,
  ShieldCheck,Users,UserPlus,X,Crown,Settings,Globe2
} from 'lucide-react'
import {
  createCreativeTeam,
  createCreativeTeamTopic,
  getCreativeTeam,
  getCreativeTeams,
  getCreativeTeamTopic,
  inviteCreativeTeamMember,
  removeCreativeTeamMember,
  updateCreativeTeam,
  cancelCreativeTeamInvite,
  replyCreativeTeamTopic,
  respondCreativeTeamInvite,
  setCreativeTeamMemberRole,
  updateCreativeTeamTopic,
} from './services/teamApi'

const ROLE_LABELS={
  owner:'Dono',
  system_owner:'Arquiteto',
  lead:'Administrador',
  maintainer:'Maintainer',
  developer:'Developer',
  reviewer:'Reviewer',
  designer:'Designer',
  member:'Membro',
  viewer:'Viewer',
}
const ROLE_OPTIONS=['lead','maintainer','developer','reviewer','designer','member','viewer']

const ROLE_SUMMARIES=[
  ['owner','Dono','Controle total, incluindo privacidade, funções e remoção de membros.'],
  ['lead','Administrador','Gestão operacional ampla sem ações destrutivas; não remove membros nem concede Administrador.'],
  ['maintainer','Maintainer','Gerencia tópicos, publica vitrines, convida membros e altera configuração limitada.'],
  ['developer','Developer','Cria tópicos privados e participa das discussões da equipe.'],
  ['reviewer','Reviewer','Lê, comenta e revisa; não administra equipe nem publica vitrines.'],
  ['designer','Designer','Cria tópicos privados e colabora no conteúdo autorizado.'],
  ['member','Membro','Lê, cria tópicos privados e participa das discussões.'],
  ['viewer','Viewer','Acesso somente leitura ao conteúdo privado da equipe.'],
]

function avatar(profile,size=38){
  const name=profile?.display_name||profile?.username||'Membro'
  return profile?.avatar_url
    ? <img className="team-avatar" src={profile.avatar_url} alt="" style={{width:size,height:size}}/>
    : <span className="team-avatar team-avatar-fallback" style={{width:size,height:size}}>{name.slice(0,1).toUpperCase()}</span>
}
function relative(value){
  if(!value) return ''
  const minutes=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000))
  if(minutes<1) return 'agora'
  if(minutes<60) return 'há '+minutes+' min'
  const hours=Math.floor(minutes/60)
  if(hours<24) return 'há '+hours+' h'
  const days=Math.floor(hours/24)
  return 'há '+days+' dia'+(days===1?'':'s')
}
function TeamShell({title,onBack,children}){
  return <section className="community-page community-page-wide team-workspace-page">
    <div className="community-page-card">
      <header className="community-page-head team-page-head">
        <button onClick={onBack}><ArrowLeft/> Voltar</button>
        <h1>{title}</h1>
      </header>
      {children}
    </div>
  </section>
}

export function TeamsPage({session,navigate,notify}){
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [form,setForm]=useState({name:'',description:'',public_profile:false})

  async function load(){
    setLoading(true)
    try{setData(await getCreativeTeams())}
    catch(error){notify?.(error?.message||'Não foi possível carregar as equipes.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[session?.user?.id])

  async function create(event){
    event.preventDefault()
    setBusy(true)
    try{
      const result=await createCreativeTeam(form)
      notify?.('Equipe privada criada.')
      setOpen(false)
      setForm({name:'',description:'',public_profile:false})
      navigate('/equipes/'+result.team.slug)
    }catch(error){notify?.(error?.message||'Não foi possível criar a equipe.')}
    finally{setBusy(false)}
  }
  async function respond(inviteId,accept){
    setBusy(true)
    try{
      await respondCreativeTeamInvite(inviteId,accept)
      notify?.(accept?'Você entrou na equipe.':'Convite recusado.')
      await load()
    }catch(error){notify?.(error?.message||'Não foi possível responder ao convite.')}
    finally{setBusy(false)}
  }

  return <TeamShell title="Equipes CreativeZone" onBack={()=>navigate('/projetos')}>
    <section className="teams-hero">
      <div>
        <span>ELITE • COLABORAÇÃO PRIVADA</span>
        <h2>Espaços privados para construir projetos com sua equipe.</h2>
        <p>O dono precisa ser ELITE. Depois disso, ele pode convidar qualquer membro da CreativeZone — inclusive FREE — e definir a função de cada pessoa.</p>
      </div>
      {session?.user && data?.plan?.can_create_team
        ? <button className="action primary-action" onClick={()=>setOpen(value=>!value)}><Plus/>Nova equipe privada</button>
        : session?.user
          ? <div className="teams-plan-lock"><Crown/><span><strong>Recurso ELITE</strong><small>Participar de equipes é liberado para todos; criar uma equipe exige ELITE.</small></span></div>
          : <button className="action primary-action" onClick={()=>navigate('/entrar')}><UserPlus/>Entrar</button>}
    </section>

    {data?.invitations?.length>0&&<section className="teams-invitations">
      <header><UserPlus/><span><strong>Convites para você</strong><small>Responda sem sair do fórum</small></span></header>
      {data.invitations.map(invite=><article key={invite.id}>
        <span>{avatar(invite.team,42)}</span>
        <div><strong>{invite.team?.name}</strong><small>Função proposta: {ROLE_LABELS[invite.role]||invite.role}</small><p>{invite.message||'Você foi convidado para colaborar.'}</p></div>
        <div><button className="action primary-action" disabled={busy} onClick={()=>respond(invite.id,true)}><Check/>Aceitar</button><button className="action" disabled={busy} onClick={()=>respond(invite.id,false)}><X/>Recusar</button></div>
      </article>)}
    </section>}

    {open&&<form className="team-create-form" onSubmit={create}>
      <header><ShieldCheck/><div><strong>Criar equipe privada</strong><small>Você será o dono e poderá gerenciar membros, funções e tópicos.</small></div></header>
      <label>Nome<input required minLength={3} maxLength={80} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Aurora Engine"/></label>
      <label>Descrição<textarea maxLength={2000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="O que esta equipe está construindo?"/></label>
      <label className="team-public-profile-toggle"><input type="checkbox" checked={form.public_profile} onChange={e=>setForm({...form,public_profile:e.target.checked})}/><span><strong>Perfil público da equipe</strong><small>Visitantes podem descobrir a equipe. Membros, conteúdo privado e permissões continuam protegidos.</small></span></label>
      <button className="action primary-action" disabled={busy}>{busy?'Criando...':'Criar equipe'}</button>
    </form>}

    <section className="teams-grid-section">
      <header><strong>Equipes disponíveis</strong><small>{data?.teams?.length||0} equipe(s) visível(is) para você</small></header>
      <div className="teams-grid">
        {(data?.teams||[]).map(team=><button key={team.id} className="team-card" onClick={()=>navigate('/equipes/'+team.slug)}>
          <span className="team-card-avatar">{team.avatar_url?<img src={team.avatar_url} alt=""/>:<Users/>}</span>
          <div><strong>{team.name}</strong><p>{team.description||'Equipe CreativeZone'}</p><small>{team.member_count} membro{team.member_count===1?'':'s'} · {team.is_owner?'Você é o dono':team.is_member?'Você participa':team.public_profile?'Perfil público':'Privada'}</small></div>
          <span className="team-card-state">{team.is_owner?<Crown/>:team.is_member?<ShieldCheck/>:<Globe2/>}</span>
        </button>)}
        {!loading&&!data?.teams?.length&&<p className="community-empty">Nenhuma equipe disponível ainda.</p>}
      </div>
    </section>
  </TeamShell>
}

export function TeamPage({slug,session,navigate,notify}){
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [invite,setInvite]=useState({username:'',role:'member',message:''})
  const [topicOpen,setTopicOpen]=useState(false)
  const [topic,setTopic]=useState({title:'',visibility:'team_only',public_summary:'',content:''})
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [settings,setSettings]=useState({name:'',description:'',public_profile:false})

  async function load(){
    setLoading(true)
    try{
      const result=await getCreativeTeam(slug)
      setData(result)
      if(result?.team) setSettings({
        name:result.team.name||'',
        description:result.team.description||'',
        public_profile:Boolean(result.team.public_profile),
      })
    }
    catch(error){notify?.(error?.message||'Não foi possível carregar a equipe.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[slug,session?.user?.id])

  async function sendInvite(event){
    event.preventDefault();setBusy(true)
    try{
      await inviteCreativeTeamMember(data.team.id,invite)
      notify?.('Convite enviado na CreativeZone e encaminhado por e-mail.')
      setInvite({username:'',role:'member',message:''});await load()
    }catch(error){notify?.(error?.message||'Não foi possível enviar o convite.')}
    finally{setBusy(false)}
  }
  async function roleChange(userId,role){
    setBusy(true)
    try{await setCreativeTeamMemberRole(data.team.id,userId,role);notify?.('Permissão atualizada.');await load()}
    catch(error){notify?.(error?.message||'Não foi possível alterar a função.')}
    finally{setBusy(false)}
  }
  async function remove(userId){
    if(!window.confirm('Remover este membro da equipe?')) return
    setBusy(true)
    try{await removeCreativeTeamMember(data.team.id,userId);notify?.('Membro removido.');await load()}
    catch(error){notify?.(error?.message||'Não foi possível remover.')}
    finally{setBusy(false)}
  }
  async function saveSettings(event){
    event.preventDefault();setBusy(true)
    try{
      await updateCreativeTeam(data.team.id,{
        ...(data.permissions?.edit_team_identity?{name:settings.name}:{}),
        description:settings.description,
        ...(data.permissions?.manage_team?{public_profile:settings.public_profile}:{}),
      })
      notify?.('Configurações da equipe atualizadas.')
      setSettingsOpen(false)
      await load()
    }catch(error){notify?.(error?.message||'Não foi possível atualizar a equipe.')}
    finally{setBusy(false)}
  }

  async function cancelInvite(inviteId){
    if(!window.confirm('Cancelar este convite pendente?')) return
    setBusy(true)
    try{
      await cancelCreativeTeamInvite(data.team.id,inviteId)
      notify?.('Convite cancelado.')
      await load()
    }catch(error){notify?.(error?.message||'Não foi possível cancelar o convite.')}
    finally{setBusy(false)}
  }

  async function createTopic(event){
    event.preventDefault();setBusy(true)
    try{
      const result=await createCreativeTeamTopic(data.team.id,topic)
      setTopicOpen(false);setTopic({title:'',visibility:'team_only',public_summary:'',content:''})
      notify?.('Tópico da equipe criado.')
      navigate('/equipes/'+data.team.slug+'/topico/'+result.topic.slug)
    }catch(error){notify?.(error?.message||'Não foi possível criar o tópico.')}
    finally{setBusy(false)}
  }

  if(loading) return <TeamShell title="Equipe" onBack={()=>navigate('/equipes')}><p className="community-empty">Carregando equipe...</p></TeamShell>
  if(!data?.team) return <TeamShell title="Equipe" onBack={()=>navigate('/equipes')}><p className="community-empty">Equipe indisponível.</p></TeamShell>
  const perms=data.permissions||{}
  const assignableRoles=Array.isArray(perms.assignable_roles)&&perms.assignable_roles.length?perms.assignable_roles:ROLE_OPTIONS

  return <TeamShell title={data.team.name} onBack={()=>navigate('/equipes')}>
    <section className="team-profile-head">
      <span className="team-profile-avatar">{data.team.avatar_url?<img src={data.team.avatar_url} alt=""/>:<Users/>}</span>
      <div><span>{data.team.public_profile?'PERFIL PÚBLICO • CONTEÚDO PROTEGIDO':'EQUIPE PRIVADA'}</span><h2>{data.team.name}</h2><p>{data.team.description||'Equipe privada CreativeZone.'}</p></div>
      <div className="team-profile-actions">
        {perms.role&&<em><ShieldCheck/>{ROLE_LABELS[perms.role]||perms.role}</em>}
        {perms.edit_team&&<button type="button" className="action" onClick={()=>setSettingsOpen(value=>!value)}><Settings/>Configurações</button>}
      </div>
    </section>

    {settingsOpen&&perms.edit_team&&<form className="team-settings-panel" onSubmit={saveSettings}>
      <header><Settings/><span><strong>Configurações da equipe</strong><small>{perms.manage_team?'Identidade, descrição e exposição pública.':perms.edit_team_identity?'Administrador: identidade e descrição; privacidade continua reservada ao dono.':'Maintainer: configuração limitada à descrição.'}</small></span></header>
      <label>Nome<input required minLength={3} maxLength={80} disabled={!perms.edit_team_identity} value={settings.name} onChange={e=>setSettings({...settings,name:e.target.value})}/></label>
      <label>Descrição<textarea maxLength={2000} value={settings.description} onChange={e=>setSettings({...settings,description:e.target.value})}/></label>
      {perms.manage_team&&<label className="team-public-profile-toggle"><input type="checkbox" checked={settings.public_profile} onChange={e=>setSettings({...settings,public_profile:e.target.checked})}/><span><strong>Perfil público da equipe</strong><small>Somente o dono pode alterar esta exposição. Conteúdo privado continua protegido.</small></span></label>}
      <div className="team-settings-actions"><button type="button" className="action" onClick={()=>setSettingsOpen(false)}>Cancelar</button><button className="action primary-action" disabled={busy}>Salvar configurações</button></div>
    </form>}

    {perms.view_private&&<section className="team-members-workspace">
      <header><span><Users/><strong>Membros</strong></span><small>Passe o mouse no avatar para abrir o perfil do fórum.</small></header>
      <div className="team-member-chips">
        {(data.members||[]).map(member=><article key={member.user_id}>
          <button type="button" data-profile-username={member.profile?.username||undefined}>{avatar(member.profile,42)}</button>
          <span><strong>{member.profile?.display_name||member.profile?.username}</strong><small>{ROLE_LABELS[member.role]||member.role}</small></span>
          {member.role!=='owner'&&(perms.manage_roles||perms.remove_members)&&<div>
            {perms.manage_roles&&(perms.grant_admin||member.role!=='lead')&&<select value={member.role} disabled={busy} onChange={e=>roleChange(member.user_id,e.target.value)}>{assignableRoles.map(role=><option value={role} key={role}>{ROLE_LABELS[role]}</option>)}</select>}
            {perms.remove_members&&<button title="Remover membro" disabled={busy} onClick={()=>remove(member.user_id)}><X/></button>}
          </div>}
        </article>)}
      </div>
    </section>}

    {perms.invite_members&&<section className="team-admin-grid">
      <form onSubmit={sendInvite}>
        <header><UserPlus/><div><strong>Convidar pelo @username</strong><small>Escolha usuário, função e mensagem. O convidado recebe aviso no fórum e por e-mail.</small></div></header>
        <label>Usuário<input required value={invite.username} onChange={e=>setInvite({...invite,username:e.target.value})} placeholder="@CreativeZone"/></label>
        <label>Função<select value={invite.role} onChange={e=>setInvite({...invite,role:e.target.value})}>{assignableRoles.map(role=><option value={role} key={role}>{ROLE_LABELS[role]}</option>)}</select></label>
        <label>Mensagem<textarea maxLength={1000} value={invite.message} onChange={e=>setInvite({...invite,message:e.target.value})} placeholder="Conte no que a pessoa vai colaborar."/></label>
        <button className="action primary-action" disabled={busy}><Send/>Enviar convite</button>
      </form>
      <section>
        <header><Users/><div><strong>Convites pendentes</strong><small>{data.invitations?.length||0} aguardando resposta</small></div></header>
        {(data.invitations||[]).map(item=><article key={item.id}>{avatar(item.profile,34)}<span><strong>@{item.profile?.username}</strong><small>{ROLE_LABELS[item.role]||item.role} · {relative(item.created_at)}</small></span>{perms.cancel_invites&&<button type="button" className="team-invite-cancel" title="Cancelar convite" disabled={busy} onClick={()=>cancelInvite(item.id)}><X/></button>}</article>)}
        {!data.invitations?.length&&<p>Nenhum convite pendente.</p>}
      </section>
    </section>}

    {perms.view_private&&<section className="team-role-matrix">
      <header><ShieldCheck/><div><strong>Permissões da equipe</strong><small>As ações são validadas no backend; não são apenas controles visuais.</small></div></header>
      <div>{ROLE_SUMMARIES.map(([role,title,summary])=><article key={role} className={perms.role===role?'active':''}><strong>{title}</strong><p>{summary}</p>{perms.role===role&&<em>Sua função</em>}</article>)}</div>
    </section>}

    <section className="team-topics-section">
      <header>
        <div><MessageSquare/><span><strong>Tópicos da equipe</strong><small>Privados ou com vitrine pública e conteúdo protegido.</small></span></div>
        {perms.create_topics&&<button className="action primary-action" onClick={()=>setTopicOpen(value=>!value)}><Plus/>Novo tópico da equipe</button>}
      </header>

      {topicOpen&&<form className="team-topic-create" onSubmit={createTopic}>
        <label>Título<input required minLength={3} maxLength={160} value={topic.title} onChange={e=>setTopic({...topic,title:e.target.value})}/></label>
        {perms.publish_topics
          ? <fieldset><legend>Visibilidade</legend>
              <label><input type="radio" checked={topic.visibility==='team_only'} onChange={()=>setTopic({...topic,visibility:'team_only'})}/><LockKeyhole/><span><strong>Somente equipe</strong><small>Só membros da equipe e o Arquiteto CreativeZone podem encontrar e ler.</small></span></label>
              <label><input type="radio" checked={topic.visibility==='public_preview'} onChange={()=>setTopic({...topic,visibility:'public_preview'})}/><Eye/><span><strong>Vitrine pública</strong><small>Visitantes veem título e resumo; conteúdo importante e interação ficam restritos à equipe.</small></span></label>
            </fieldset>
          : <div className="team-private-only-note"><LockKeyhole/><span><strong>Seu tópico será privado</strong><small>Somente Owner, Administrador e Maintainer podem publicar uma vitrine pública.</small></span></div>}
        {topic.visibility==='public_preview'&&<label>Resumo público<textarea required maxLength={3000} value={topic.public_summary} onChange={e=>setTopic({...topic,public_summary:e.target.value})} placeholder="O que a comunidade pode ver sobre este trabalho?"/></label>}
        <label>Conteúdo da equipe<textarea required maxLength={50000} value={topic.content} onChange={e=>setTopic({...topic,content:e.target.value})} placeholder="Planejamento, código, documentos, decisões e conteúdo restrito..."/></label>
        <button className="action primary-action" disabled={busy}>Criar tópico</button>
      </form>}

      <div className="team-topic-list">
        {(data.topics||[]).map(item=><button key={item.id} onClick={()=>navigate('/equipes/'+data.team.slug+'/topico/'+item.slug)}>
          <span className={'team-topic-visibility '+item.visibility}>{item.visibility==='team_only'?<LockKeyhole/>:<Eye/>}</span>
          <div><strong>{item.title}</strong><p>{item.public_summary||'Conteúdo privado da equipe.'}</p><small>{item.author?.display_name||item.author?.username} · {relative(item.updated_at)}</small></div>
          <span>{item.visibility==='public_preview'?'Vitrine pública':'Privado'}</span>
        </button>)}
        {!data.topics?.length&&<p className="community-empty">Nenhum tópico criado nesta equipe.</p>}
      </div>
    </section>
  </TeamShell>
}

export function TeamTopicPage({teamSlug,topicSlug,session,navigate,notify}){
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [reply,setReply]=useState('')
  const [busy,setBusy]=useState(false)

  async function load(){
    setLoading(true)
    try{setData(await getCreativeTeamTopic(teamSlug,topicSlug))}
    catch(error){notify?.(error?.message||'Não foi possível carregar o tópico.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[teamSlug,topicSlug,session?.user?.id])

  async function toggleLocked(){
    setBusy(true)
    try{
      await updateCreativeTeamTopic(data.topic.id,{locked:!data.topic.locked})
      await load()
      notify?.(data.topic.locked?'Tópico reaberto.':'Tópico fechado para novas respostas.')
    }catch(error){notify?.(error?.message||'Não foi possível alterar o tópico.')}
    finally{setBusy(false)}
  }

  async function changeVisibility(value){
    if(value==='public_preview'&&!String(data.topic.public_summary||'').trim()){
      notify?.('Adicione um resumo público antes de transformar este tópico em vitrine pública.')
      return
    }
    setBusy(true)
    try{
      await updateCreativeTeamTopic(data.topic.id,{visibility:value})
      await load()
      notify?.(value==='public_preview'?'Vitrine pública ativada.':'Tópico definido como somente equipe.')
    }catch(error){notify?.(error?.message||'Não foi possível alterar a visibilidade.')}
    finally{setBusy(false)}
  }

  async function send(event){
    event.preventDefault()
    if(!reply.trim()) return
    setBusy(true)
    try{await replyCreativeTeamTopic(data.topic.id,reply.trim());setReply('');await load();notify?.('Resposta publicada para a equipe.')}
    catch(error){notify?.(error?.message||'Não foi possível responder.')}
    finally{setBusy(false)}
  }

  if(loading) return <TeamShell title="Tópico da equipe" onBack={()=>navigate('/equipes/'+teamSlug)}><p className="community-empty">Carregando...</p></TeamShell>
  if(!data?.topic) return <TeamShell title="Tópico da equipe" onBack={()=>navigate('/equipes/'+teamSlug)}><p className="community-empty">Tópico indisponível.</p></TeamShell>
  const privateVisible=Boolean(data.private_content!==null)
  return <TeamShell title={data.topic.title} onBack={()=>navigate('/equipes/'+teamSlug)}>
    <article className="team-topic-page">
      <header>
        <span className={'team-topic-visibility '+data.topic.visibility}>{data.topic.visibility==='team_only'?<LockKeyhole/>:<Eye/>}</span>
        <div><small>{data.team.name}</small><h2>{data.topic.title}</h2><p>{data.topic.public_summary}</p></div>
        {data.permissions?.manage_topics&&<div className="team-topic-admin-actions">
          {data.permissions?.publish_topics&&<button type="button" className="action" disabled={busy} onClick={()=>changeVisibility(data.topic.visibility==='team_only'?'public_preview':'team_only')}>{data.topic.visibility==='team_only'?<Eye/>:<EyeOff/>}{data.topic.visibility==='team_only'?'Tornar vitrine':'Tornar privado'}</button>}
          <button type="button" className="action" disabled={busy} onClick={toggleLocked}><LockKeyhole/>{data.topic.locked?'Reabrir tópico':'Fechar tópico'}</button>
        </div>}
      </header>

      {privateVisible
        ? <section className="team-topic-private-content"><header><ShieldCheck/><strong>Conteúdo da equipe</strong></header><div>{data.private_content}</div></section>
        : <section className="team-topic-locked-preview"><LockKeyhole/><h3>O restante é privado para a equipe</h3><p>Este tópico possui uma vitrine pública, mas conteúdo importante, arquivos, respostas e decisões ficam disponíveis apenas aos membros autorizados.</p>{!session?.user&&<button className="action primary-action" onClick={()=>navigate('/entrar')}>Entrar na CreativeZone</button>}</section>}

      {privateVisible&&<section className="team-topic-discussion">
        <header><MessageSquare/><strong>Discussão privada</strong><small>{data.posts?.length||0} resposta(s)</small></header>
        <div>{(data.posts||[]).map(post=><article key={post.id}><button data-profile-username={post.author?.username||undefined}>{avatar(post.author,38)}</button><span><strong>{post.author?.display_name||post.author?.username}</strong><small>{relative(post.created_at)}</small><p>{post.content}</p></span></article>)}</div>
        {data.permissions?.reply&&!data.topic.locked&&<form onSubmit={send}><textarea required maxLength={20000} value={reply} onChange={e=>setReply(e.target.value)} placeholder="Responder somente para a equipe..."/><button className="action primary-action" disabled={busy}><Send/>{busy?'Enviando...':'Responder'}</button></form>}
        {data.topic.locked&&<p className="team-topic-locked-note"><LockKeyhole/> Tópico fechado pela equipe.</p>}
      </section>}
    </article>
  </TeamShell>
}
