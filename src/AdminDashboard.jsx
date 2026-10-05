import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  Check,
  Crown,
  Database,
  Gem,
  Mail,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Tag,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import {
  adminRetryEmailJob,
  adminReviewCategorySuggestion,
  adminReviewReport,
  adminRevokeMembership,
  adminSetMembership,
  adminUpdateMember,
  adminUpdateProjectStatus,
  formatMoney,
  getAdminDashboard,
} from './services/adminApi'
import {
  getHistoricalBadgeAdminData,
  getMembershipPlans,
  manageHistoricalBadge,
  rejectMembershipRequest,
} from './services/membershipApi'

const tabs = [
  ['overview','Visão geral',Activity],
  ['members','Membros',Users],
  ['vip','VIP & pagamentos',Crown],
  ['moderation','Moderação',Shield],
  ['projects','Projetos & categorias',Briefcase],
  ['system','Sistema',Database],
]

function Metric({ label, value, icon: Icon, tone = '' }) {
  return (
    <article className={'admin-metric ' + tone}>
      <Icon />
      <div><strong>{Number(value || 0).toLocaleString('pt-BR')}</strong><span>{label}</span></div>
    </article>
  )
}

function MemberAvatar({ member }) {
  const name = member?.display_name || member?.username || 'M'
  return member?.avatar_url
    ? <img className="admin-member-avatar" src={member.avatar_url} alt="" />
    : <span className="admin-member-avatar admin-member-fallback">{name.slice(0,1).toUpperCase()}</span>
}

function formatDate(value, withTime = false) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', withTime
    ? { dateStyle:'short',timeStyle:'short' }
    : { dateStyle:'short' }
  ).format(new Date(value))
}

function Overview({ data, onTab }) {
  const m = data.metrics || {}
  return (
    <div className="admin-overview">
      <div className="admin-metrics-grid">
        <Metric label="Membros" value={m.members} icon={Users} />
        <Metric label="Ativos em 7 dias" value={m.active_7d} icon={Activity} />
        <Metric label="Tópicos" value={m.topics} icon={Tag} />
        <Metric label="Respostas" value={m.posts} icon={BadgeCheck} />
        <Metric label="VIPs ativos" value={m.active_vips} icon={Crown} tone="vip" />
        <Metric label="VIPs vencendo em 7 dias" value={m.expiring_vips_7d} icon={AlertTriangle} tone="warning" />
        <Metric label="Denúncias pendentes" value={m.pending_reports} icon={Shield} tone={m.pending_reports ? 'danger' : ''} />
        <Metric label="Projetos ativos" value={m.projects} icon={Briefcase} />
        <Metric label="Push cadastrados" value={m.push_subscriptions} icon={Settings} />
        <Metric label="E-mails pendentes" value={m.email_pending} icon={Mail} />
        <Metric label="E-mails com falha" value={m.email_failed} icon={AlertTriangle} tone={m.email_failed ? 'danger' : ''} />
        <Metric label="Novos membros / 7 dias" value={m.new_members_7d} icon={Users} />
      </div>

      <section className="admin-quick-actions">
        <h2>Ações rápidas</h2>
        <div>
          <button onClick={() => onTab('vip')}><Gem /> Conceder ou renovar VIP</button>
          <button onClick={() => onTab('members')}><UserCog /> Gerenciar membros</button>
          <button onClick={() => onTab('moderation')}><Shield /> Revisar denúncias</button>
          <button onClick={() => onTab('system')}><Database /> Ver saúde do sistema</button>
        </div>
      </section>
    </div>
  )
}

function MembersTab({ data, notify, reload }) {
  const [drafts,setDrafts] = useState({})

  function getDraft(member) {
    return drafts[member.id] || {
      role:member.role,
      accountStatus:member.account_status,
    }
  }

  async function save(member) {
    const draft=getDraft(member)
    try {
      await adminUpdateMember(member.id,draft.role,draft.accountStatus)
      notify('Membro atualizado.')
      await reload()
    } catch (error) {
      notify(error?.message || 'Não foi possível atualizar o membro.')
    }
  }

  return (
    <section className="admin-table-section">
      <header><Users /><div><h2>Membros</h2><p>Cargos, status, XP, atividade e plano atual.</p></div></header>
      <div className="admin-member-list">
        {(data.members || []).map((member) => {
          const draft=getDraft(member)
          return (
            <article key={member.id} className={member.system_owner ? 'system-owner' : ''}>
              <MemberAvatar member={member} />
              <div className="admin-member-main">
                <strong>{member.display_name || member.username}</strong>
                <span>@{member.username} · {member.email}</span>
                <small>
                  {member.reputation?.toLocaleString('pt-BR') || 0} XP · último acesso {formatDate(member.last_seen_at,true)}
                </small>
              </div>
              <div className="admin-member-plan">
                {member.system_owner
                  ? <b className="identity-badge architect">🏗️ Arquiteto</b>
                  : member.plan_id && member.membership_status==='active'
                    ? <b className={'identity-badge membership-'+member.plan_id}>{member.plan_badge}{member.permanent?' ∞':''}</b>
                    : <b className="identity-badge">FREE</b>}
                {member.ends_at && !member.permanent && <small>até {formatDate(member.ends_at)}</small>}
              </div>
              <select
                disabled={member.system_owner}
                value={draft.role}
                onChange={(e)=>setDrafts((current)=>({...current,[member.id]:{...getDraft(member),role:e.target.value}}))}
              >
                <option value="member">Membro</option>
                <option value="moderator">Moderador</option>
                <option value="admin">Administrador</option>
              </select>
              <select
                disabled={member.system_owner}
                value={draft.accountStatus}
                onChange={(e)=>setDrafts((current)=>({...current,[member.id]:{...getDraft(member),accountStatus:e.target.value}}))}
              >
                <option value="active">Ativo</option>
                <option value="deactivated">Desativado</option>
              </select>
              <button className="action" disabled={member.system_owner} onClick={()=>save(member)}>Salvar</button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function VipTab({ data, plans, notify, reload, session }) {
  const members=data.members || []
  const [userId,setUserId]=useState('')
  const [planId,setPlanId]=useState('pro')
  const [months,setMonths]=useState(1)
  const [permanent,setPermanent]=useState(false)
  const [busy,setBusy]=useState(false)

  const selectedMember=members.find((item)=>item.id===userId)

  async function grant({request=null}={}) {
    const targetId=request?.user_id || userId
    const targetPlan=request?.plan_id || planId
    const targetMonths=request?.months_requested || months
    if(!targetId) return notify('Selecione um membro.')

    setBusy(true)
    try {
      await adminSetMembership({
        userId:targetId,
        planId:targetPlan,
        months:targetMonths,
        permanent:request ? false : permanent,
        requestId:request?.id || null,
      })
      notify(request
        ? 'Pagamento aprovado e VIP ativado.'
        : permanent ? 'VIP permanente concedido.' : 'VIP concedido/estendido.')
      await reload()
    } catch(error) {
      notify(error?.message || 'Não foi possível conceder o VIP.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(member) {
    if(!window.confirm('Remover o VIP de '+(member.display_name || member.username)+'?')) return
    try {
      await adminRevokeMembership(member.id,'Removido pelo painel administrativo')
      notify('VIP removido.')
      await reload()
    } catch(error) {
      notify(error?.message || 'Não foi possível remover o VIP.')
    }
  }

  async function rejectRequest(request) {
    if(!window.confirm('Recusar a solicitação ' + request.reference_code + '?')) return
    setBusy(true)
    try {
      await rejectMembershipRequest(request.id, session.user.id)
      notify('Solicitação recusada.')
      await reload()
    } catch(error) {
      notify(error?.message || 'Não foi possível recusar a solicitação.')
    } finally {
      setBusy(false)
    }
  }

  const pending=(data.membership_requests || []).filter((item)=>item.status==='pending')
  const active=members.filter((item)=>item.membership_status==='active' && item.plan_id)

  return (
    <div className="admin-vip-grid">
      <section className="admin-card">
        <header><Crown /><div><h2>Conceder / renovar VIP</h2><p>Defina plano, quantidade de meses ou acesso permanente.</p></div></header>
        <div className="admin-vip-form">
          <label>Membro
            <select value={userId} onChange={(e)=>setUserId(e.target.value)}>
              <option value="">Selecione...</option>
              {members.map((member)=><option key={member.id} value={member.id}>@{member.username} — {member.email}</option>)}
            </select>
          </label>
          <label>Plano
            <select value={planId} onChange={(e)=>setPlanId(e.target.value)}>
              {plans.filter((plan)=>plan.id!=='free').map((plan)=>(
                <option value={plan.id} key={plan.id}>{plan.name} — {formatMoney(plan.price_cents,plan.currency)}/mês</option>
              ))}
            </select>
          </label>
          <label>Meses
            <input type="number" min="1" max="36" value={months} disabled={permanent} onChange={(e)=>setMonths(e.target.value)} />
          </label>
          <label className="admin-check">
            <input type="checkbox" checked={permanent} onChange={(e)=>setPermanent(e.target.checked)} />
            Permanente
          </label>
          {selectedMember && <small>Selecionado: {selectedMember.display_name || selectedMember.username}</small>}
          <button className="action primary-action" disabled={busy||!userId} onClick={()=>grant()}><Check /> Aplicar VIP</button>
        </div>
      </section>

      <section className="admin-card admin-pending-payments">
        <header><Mail /><div><h2>Pedidos via WhatsApp</h2><p>Confira a referência e aprove após validar o pagamento.</p></div></header>
        {pending.map((request)=>(
          <article key={request.id}>
            <div>
              <strong>{request.display_name || request.username}</strong>
              <span>@{request.username} · {request.email}</span>
              <small>{request.reference_code} · {request.plan_badge} · {request.months_requested} mês(es)</small>
              <b>{formatMoney(request.total_price_cents,request.currency)}</b>
            </div>
            <div className="admin-payment-actions">
              <button className="action primary-action" disabled={busy} onClick={()=>grant({request})}><Check /> Aprovar</button>
              <button className="action danger-action" disabled={busy} onClick={()=>rejectRequest(request)}><X /> Recusar</button>
            </div>
          </article>
        ))}
        {!pending.length && <p className="admin-empty">Nenhum pedido pendente.</p>}
      </section>

      <section className="admin-card admin-vip-active">
        <header><Gem /><div><h2>VIPs ativos</h2><p>Validade atual e acesso permanente.</p></div></header>
        {active.map((member)=>(
          <article key={member.id}>
            <MemberAvatar member={member} />
            <div>
              <strong>{member.display_name || member.username}</strong>
              <span>{member.plan_name} {member.permanent?'· permanente':'· até '+formatDate(member.ends_at)}</span>
            </div>
            {!member.system_owner && <button className="action danger-action" onClick={()=>revoke(member)}>Remover</button>}
          </article>
        ))}
      </section>

      <HistoricalBadgesPanel notify={notify} />
    </div>
  )
}


function HistoricalBadgesPanel({ notify }) {
  const [data,setData]=useState({profiles:[],badges:[],awards:[]})
  const [busy,setBusy]=useState('')

  async function load() {
    setData(await getHistoricalBadgeAdminData())
  }

  useEffect(()=>{ load().catch(()=>{}) },[])

  const active=useMemo(
    ()=>new Set((data.awards || []).map((award)=>award.user_id+':'+award.badge_id)),
    [data.awards]
  )

  async function toggle(profile,badge) {
    const key=profile.id+':'+badge.id
    setBusy(key)
    try {
      const granted=active.has(key)
      await manageHistoricalBadge(profile.id,badge.slug,!granted)
      notify((granted?'Insígnia removida: ':'Insígnia concedida: ')+badge.name+'.')
      await load()
    } catch(error) {
      notify(error?.message || 'Não foi possível alterar a insígnia.')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="admin-card admin-historical-badges">
      <header><BadgeCheck /><div><h2>Insígnias históricas</h2><p>Beta Tester, Pioneiro e Early Supporter.</p></div></header>
      <div className="admin-historical-list">
        {(data.profiles || []).map((profile)=>(
          <article key={profile.id}>
            <div className="admin-historical-person">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" />
                : <span>{(profile.display_name || profile.username || 'M').slice(0,1).toUpperCase()}</span>}
              <div><strong>{profile.display_name || profile.username}</strong><small>@{profile.username}</small></div>
            </div>
            <div className="admin-historical-actions">
              {(data.badges || []).map((badge)=>{
                const key=profile.id+':'+badge.id
                const granted=active.has(key)
                return (
                  <button
                    key={badge.id}
                    className={'historical-badge-toggle '+(granted?'active':'')}
                    disabled={busy===key}
                    onClick={()=>toggle(profile,badge)}
                  >
                    {badge.icon} {badge.name}
                  </button>
                )
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ModerationTab({ data, notify, reload }) {
  const [notes,setNotes]=useState({})
  const reports=(data.reports || []).filter((item)=>['pending','reviewing'].includes(item.status))

  async function review(report,status) {
    try {
      await adminReviewReport(report.id,status,notes[report.id] || '')
      notify(status==='resolved'?'Denúncia resolvida.':'Denúncia descartada.')
      await reload()
    } catch(error) {
      notify(error?.message || 'Não foi possível revisar a denúncia.')
    }
  }

  return (
    <section className="admin-card">
      <header><Shield /><div><h2>Denúncias</h2><p>Fila central de moderação da comunidade.</p></div></header>
      <div className="admin-report-list">
        {reports.map((report)=>(
          <article key={report.id}>
            <div>
              <strong>{report.target_type} · {report.reason}</strong>
              <span>por @{report.reporter_username || 'membro'} · {formatDate(report.created_at,true)}</span>
              <p>{report.details || 'Sem detalhes adicionais.'}</p>
            </div>
            <textarea
              placeholder="Nota da resolução"
              value={notes[report.id] || ''}
              onChange={(e)=>setNotes((current)=>({...current,[report.id]:e.target.value}))}
            />
            <div>
              <button className="action primary-action" onClick={()=>review(report,'resolved')}><Check /> Resolver</button>
              <button className="action" onClick={()=>review(report,'dismissed')}><X /> Descartar</button>
            </div>
          </article>
        ))}
        {!reports.length && <p className="admin-empty">Nenhuma denúncia pendente.</p>}
      </div>
    </section>
  )
}

function ProjectsTab({ data, notify, reload }) {
  async function category(item,status) {
    try {
      await adminReviewCategorySuggestion(item.id,status,'Revisado pelo painel administrativo')
      notify(status==='approved'?'Sugestão aprovada.':'Sugestão recusada.')
      await reload()
    } catch(error) { notify(error?.message || 'Não foi possível revisar a sugestão.') }
  }

  async function projectStatus(project,status) {
    try {
      await adminUpdateProjectStatus(project.id,status)
      notify('Status do projeto atualizado.')
      await reload()
    } catch(error) { notify(error?.message || 'Não foi possível atualizar o projeto.') }
  }

  return (
    <div className="admin-project-columns">
      <section className="admin-card">
        <header><Tag /><div><h2>Sugestões de categoria</h2><p>Organize a estrutura do fórum.</p></div></header>
        {(data.category_suggestions || []).filter((item)=>['pending','reviewing'].includes(item.status)).map((item)=>(
          <article className="admin-category-suggestion" key={item.id}>
            <div><strong>{item.suggested_name}</strong><span>@{item.username} · {formatDate(item.created_at)}</span><p>{item.description}</p></div>
            <div><button className="action primary-action" onClick={()=>category(item,'approved')}>Aprovar</button><button className="action" onClick={()=>category(item,'declined')}>Recusar</button></div>
          </article>
        ))}
      </section>

      <section className="admin-card">
        <header><Briefcase /><div><h2>Projetos</h2><p>Acompanhe e altere o estágio dos projetos.</p></div></header>
        {(data.projects || []).map((project)=>(
          <article className="admin-project-row" key={project.id}>
            <div><strong>{project.title}</strong><span>{project.owner_name || project.owner_username || 'Sem proprietário'} · {project.visibility}</span></div>
            <select value={project.status} onChange={(e)=>projectStatus(project,e.target.value)}>
              {['idea','planning','active','paused','completed','archived'].map((status)=><option key={status} value={status}>{status}</option>)}
            </select>
          </article>
        ))}
      </section>
    </div>
  )
}

function SystemTab({ data, notify, reload }) {
  async function retry(job) {
    try {
      await adminRetryEmailJob(job.id)
      notify('E-mail colocado novamente na fila.')
      await reload()
    } catch(error) { notify(error?.message || 'Não foi possível reenfileirar o e-mail.') }
  }

  return (
    <div className="admin-system-grid">
      <section className="admin-card">
        <header><Mail /><div><h2>Fila de e-mails</h2><p>Resend + fila transacional da CreativeZone.</p></div></header>
        {(data.email_queue || []).map((job)=>(
          <article className={'admin-email-job status-'+job.status} key={job.id}>
            <div>
              <strong>{job.notification_type} · {job.status}</strong>
              <span>{job.recipient_email} · tentativas: {job.attempts}</span>
              {job.error_message && <p>{job.error_message}</p>}
            </div>
            {job.status==='failed' && <button className="action" onClick={()=>retry(job)}><RefreshCw /> Tentar novamente</button>}
          </article>
        ))}
        {!(data.email_queue || []).length && <p className="admin-empty">Nenhum e-mail pendente ou com falha.</p>}
      </section>

      <section className="admin-card">
        <header><Database /><div><h2>Auditoria administrativa</h2><p>Últimas alterações sensíveis registradas.</p></div></header>
        <div className="admin-audit-list">
          {(data.audit || []).map((item)=>(
            <article key={item.id}>
              <strong>{item.action_type}</strong>
              <span>{item.target_type} · @{item.moderator_username || 'sistema'} · {formatDate(item.created_at,true)}</span>
              {item.reason && <p>{item.reason}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export function AdminDashboard({ session, profile, navigate, notify }) {
  const [tab,setTab]=useState('overview')
  const [data,setData]=useState({})
  const [plans,setPlans]=useState([])
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const isAdmin=profile?.role==='admin'

  async function reload(nextSearch=search) {
    if(!isAdmin) return
    setLoading(true)
    setError('')
    try {
      const [dashboard,nextPlans]=await Promise.all([
        getAdminDashboard(nextSearch,200),
        getMembershipPlans(),
      ])
      setData(dashboard)
      setPlans(nextPlans)
    } catch(err) {
      setError(err?.message || 'Não foi possível carregar o painel administrativo.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ reload('') },[isAdmin,session?.user?.id])

  if(!session || !isAdmin) {
    return (
      <section className="standalone-page">
        <div className="page-card">
          <header className="page-titlebar"><button className="page-back" onClick={()=>navigate('/')}><ArrowLeft /> Voltar</button><h1>Painel administrativo</h1></header>
          <p className="admin-empty">Acesso exclusivo para administradores.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="standalone-page admin-dashboard-page">
      <div className="page-card admin-dashboard-card">
        <header className="admin-dashboard-head">
          <button className="page-back" onClick={()=>navigate('/')}><ArrowLeft /> Voltar</button>
          <div><Shield /><span><h1>Painel administrativo</h1><small>Controle central da CreativeZone</small></span></div>
          <button className="action" onClick={()=>reload()} disabled={loading}><RefreshCw /> Atualizar</button>
        </header>

        <nav className="admin-tabs">
          {tabs.map(([value,label,Icon])=>(
            <button key={value} className={tab===value?'active':''} onClick={()=>setTab(value)}><Icon /> {label}</button>
          ))}
        </nav>

        {tab==='members' && (
          <form className="admin-search" onSubmit={(e)=>{e.preventDefault();reload(search)}}>
            <Search /><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar membro por nome, @usuário ou e-mail" />
            <button className="action" type="submit">Buscar</button>
          </form>
        )}

        {error && <p className="admin-error">{error}</p>}
        {loading ? <p className="admin-empty">Carregando painel...</p> : (
          <div className="admin-tab-content">
            {tab==='overview' && <Overview data={data} onTab={setTab} />}
            {tab==='members' && <MembersTab data={data} notify={notify} reload={()=>reload()} />}
            {tab==='vip' && <VipTab data={data} plans={plans} notify={notify} reload={()=>reload()} session={session} />}
            {tab==='moderation' && <ModerationTab data={data} notify={notify} reload={()=>reload()} />}
            {tab==='projects' && <ProjectsTab data={data} notify={notify} reload={()=>reload()} />}
            {tab==='system' && <SystemTab data={data} notify={notify} reload={()=>reload()} />}
          </div>
        )}
      </div>
    </section>
  )
}
