import React, { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Crown,
  Gem,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react'
import {
  adminGrantMembership,
  getMembershipPlans,
  getMembershipRequests,
  getMembershipState,
  getProfileCosmetics,
  rejectMembershipRequest,
  requestMembershipUpgrade,
  saveProfileCosmetics,
} from './services/membershipApi'

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value))
}

const benefits = [
  ['name_color','Cor personalizada do nome'],
  ['custom_title','Título personalizado'],
  ['avatar_frame','Moldura especial de avatar'],
  ['animated_cover','Capa animada'],
  ['early_access','Acesso antecipado a recursos'],
  ['elite_area','Área Elite'],
  ['creator_tools','Ferramentas extras para criadores'],
  ['ads_free','Experiência sem anúncios'],
]

function PlanCard({ plan, current, onRequest, busy }) {
  const active = current?.plan_id === plan.id
  const e = plan.entitlements || {}
  return (
    <article className={'membership-plan-card plan-' + plan.id + (active ? ' active' : '')}>
      <header>
        <span className="membership-plan-icon">
          {plan.id === 'elite' ? <Gem /> : plan.id === 'pro' ? <Crown /> : <Star />}
        </span>
        <div>
          <strong>{plan.name}</strong>
          <small>{plan.description}</small>
        </div>
        <b>{plan.badge}</b>
      </header>

      <div className="membership-plan-benefits">
        <span><Check /> {e.featured_projects ?? 3} projetos destacados</span>
        <span><Check /> Anexos de até {e.forum_upload_mb ?? 10} MB</span>
        <span><Check /> Até {e.forum_upload_count ?? 4} anexos por publicação</span>
        {benefits.map(([key,label]) => (
          <span className={e[key] ? '' : 'muted'} key={key}>
            {e[key] ? <Check /> : <X />} {label}
          </span>
        ))}
      </div>

      {active ? (
        <button className="membership-current" disabled>Plano atual</button>
      ) : plan.id !== 'free' ? (
        <button className="action membership-request-button" disabled={busy} onClick={() => onRequest(plan.id)}>
          Solicitar {plan.badge}
        </button>
      ) : null}
    </article>
  )
}

function CosmeticsForm({ state, cosmetics, setCosmetics, onSave, busy }) {
  const e = state?.entitlements || {}
  const owner = Boolean(state?.system_owner)

  return (
    <form className="membership-cosmetics" onSubmit={onSave}>
      <header>
        <Sparkles />
        <div>
          <strong>Identidade visual</strong>
          <small>Personalize como seu perfil aparece na comunidade.</small>
        </div>
      </header>

      <label>
        Cor do nome
        <div className="membership-color-field">
          <input
            type="color"
            value={cosmetics.name_color || '#ff3b30'}
            disabled={!e.name_color}
            onChange={(event) => setCosmetics((current) => ({ ...current, name_color: event.target.value }))}
          />
          <input
            value={cosmetics.name_color || ''}
            disabled={!e.name_color}
            maxLength={7}
            placeholder="#FF3B30"
            onChange={(event) => setCosmetics((current) => ({ ...current, name_color: event.target.value }))}
          />
        </div>
      </label>

      <label>
        Título do perfil
        <input
          value={cosmetics.profile_title || ''}
          disabled={!e.custom_title}
          maxLength={40}
          placeholder={owner ? 'Arquiteto CreativeZone' : 'Ex.: Full Stack Developer'}
          onChange={(event) => setCosmetics((current) => ({ ...current, profile_title: event.target.value }))}
        />
      </label>

      <label>
        Moldura do avatar
        <select
          value={cosmetics.avatar_frame || 'none'}
          disabled={!e.avatar_frame}
          onChange={(event) => setCosmetics((current) => ({ ...current, avatar_frame: event.target.value }))}
        >
          <option value="none">Sem moldura</option>
          {state?.plan_id === 'pro' && <option value="pro">PRO</option>}
          {(state?.plan_id === 'elite' || owner) && <option value="pro">PRO</option>}
          {(state?.plan_id === 'elite' || owner) && <option value="elite">ELITE</option>}
          {owner && <option value="architect">Arquiteto CreativeZone</option>}
        </select>
      </label>

      <label>
        Efeito da capa
        <select
          value={cosmetics.cover_effect || 'none'}
          disabled={!e.animated_cover}
          onChange={(event) => setCosmetics((current) => ({ ...current, cover_effect: event.target.value }))}
        >
          <option value="none">Normal</option>
          <option value="subtle">Premium discreto</option>
          {(state?.plan_id === 'elite' || owner) && <option value="elite">ELITE</option>}
          {owner && <option value="architect">Arquiteto CreativeZone</option>}
        </select>
      </label>

      <label>
        Estilo da insígnia
        <select
          value={cosmetics.badge_style || 'default'}
          disabled={!e.avatar_frame}
          onChange={(event) => setCosmetics((current) => ({ ...current, badge_style: event.target.value }))}
        >
          <option value="default">Padrão</option>
          {state?.plan_id === 'pro' && <option value="pro">PRO</option>}
          {(state?.plan_id === 'elite' || owner) && <option value="pro">PRO</option>}
          {(state?.plan_id === 'elite' || owner) && <option value="elite">ELITE</option>}
          {owner && <option value="architect">Arquiteto CreativeZone</option>}
        </select>
      </label>

      <button className="action primary-action" disabled={busy}>
        <Sparkles /> Salvar personalização
      </button>
    </form>
  )
}

function AdminRequests({ session, requests, reload, notify }) {
  const [busyId,setBusyId] = useState(null)

  async function approve(request, permanent) {
    setBusyId(request.id)
    try {
      await adminGrantMembership({
        adminId: session.user.id,
        userId: request.user_id,
        planId: request.plan_id,
        permanent,
        days: 30,
        requestId: request.id,
      })
      notify(permanent ? 'Plano permanente concedido.' : 'Plano concedido por 30 dias.')
      await reload()
    } catch (error) {
      notify(error?.message || 'Não foi possível aprovar o plano.')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(request) {
    setBusyId(request.id)
    try {
      await rejectMembershipRequest(request.id, session.user.id)
      notify('Solicitação recusada.')
      await reload()
    } catch (error) {
      notify(error?.message || 'Não foi possível recusar a solicitação.')
    } finally {
      setBusyId(null)
    }
  }

  const pending = requests.filter((item) => item.status === 'pending')

  return (
    <section className="membership-admin-panel">
      <header>
        <ShieldCheck />
        <div><strong>Gerenciar upgrades</strong><small>Solicitações pendentes dos membros.</small></div>
      </header>
      {pending.map((request) => (
        <article key={request.id}>
          <div>
            <strong>{request.profile?.display_name || request.profile?.username || 'Membro'}</strong>
            <small>@{request.profile?.username || 'membro'} · {request.plan?.badge || request.plan_id.toUpperCase()}</small>
            {request.message && <p>{request.message}</p>}
          </div>
          <div>
            <button className="action" disabled={busyId===request.id} onClick={() => approve(request,false)}>30 dias</button>
            <button className="action primary-action" disabled={busyId===request.id} onClick={() => approve(request,true)}>Permanente</button>
            <button className="action danger-action" disabled={busyId===request.id} onClick={() => reject(request)}>Recusar</button>
          </div>
        </article>
      ))}
      {!pending.length && <p className="community-empty">Nenhuma solicitação de upgrade pendente.</p>}
    </section>
  )
}

export function MembershipSection({ session, profile, state, setState, notify }) {
  const [plans,setPlans] = useState([])
  const [cosmetics,setCosmetics] = useState({
    name_color:null,
    profile_title:null,
    avatar_frame:'none',
    cover_effect:'none',
    badge_style:'default',
  })
  const [requests,setRequests] = useState([])
  const [busy,setBusy] = useState(false)

  const isAdmin = profile?.role === 'admin'
  const currentRank = useMemo(
    () => plans.find((plan) => plan.id === state?.plan_id)?.rank ?? 0,
    [plans,state?.plan_id]
  )

  async function reload() {
    if (!session?.user?.id) return
    const tasks = [
      getMembershipPlans(),
      getMembershipState(session.user.id),
      getProfileCosmetics(session.user.id),
    ]
    if (isAdmin) tasks.push(getMembershipRequests())

    const [nextPlans,nextState,nextCosmetics,nextRequests] = await Promise.all(tasks)
    setPlans(nextPlans)
    setState?.(nextState)
    setCosmetics(nextCosmetics || {
      name_color:null,
      profile_title:null,
      avatar_frame:'none',
      cover_effect:'none',
      badge_style:'default',
    })
    if (isAdmin) setRequests(nextRequests || [])
  }

  useEffect(() => {
    reload().catch((error) => notify(error?.message || 'Não foi possível carregar os planos.'))
  }, [session?.user?.id,isAdmin])

  async function request(planId) {
    const plan = plans.find((item) => item.id === planId)
    if (!plan || plan.rank <= currentRank) return
    setBusy(true)
    try {
      await requestMembershipUpgrade(session.user.id,planId)
      notify('Solicitação ' + plan.badge + ' enviada para análise.')
      if (isAdmin) setRequests(await getMembershipRequests())
    } catch (error) {
      notify(error?.code === '23505'
        ? 'Você já possui uma solicitação de upgrade pendente.'
        : (error?.message || 'Não foi possível solicitar o upgrade.'))
    } finally {
      setBusy(false)
    }
  }

  async function saveCosmetics(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const next = await saveProfileCosmetics(session.user.id,cosmetics)
      setCosmetics(next)
      notify('Identidade visual atualizada.')
    } catch (error) {
      notify(error?.message || 'Não foi possível salvar a personalização.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="membership-section">
      <section className={'membership-current-card plan-' + (state?.plan_id || 'free')}>
        <div className="membership-current-icon">
          {state?.system_owner ? <Zap /> : state?.plan_id === 'elite' ? <Gem /> : state?.plan_id === 'pro' ? <Crown /> : <Star />}
        </div>
        <div>
          <span>Seu plano</span>
          <h2>{state?.plan_name || 'CreativeZone Free'}</h2>
          <p>
            {state?.system_owner
              ? 'Arquiteto CreativeZone · acesso total · ELITE permanente'
              : state?.permanent
                ? 'Assinatura permanente'
                : state?.ends_at
                  ? 'Ativo até ' + formatDate(state.ends_at)
                  : 'Plano padrão da comunidade'}
          </p>
        </div>
        <b>{state?.system_owner ? 'ARQUITETO' : (state?.badge || 'FREE')}</b>
      </section>

      <div className="membership-plan-grid">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={state}
            onRequest={request}
            busy={busy}
          />
        ))}
      </div>

      <CosmeticsForm
        state={state}
        cosmetics={cosmetics}
        setCosmetics={setCosmetics}
        onSave={saveCosmetics}
        busy={busy}
      />

      {state?.entitlements?.elite_area && (
        <section className="elite-access-card">
          <Gem />
          <div>
            <strong>Elite Lounge liberado</strong>
            <small>Seu plano possui acesso à área exclusiva e aos recursos antecipados da CreativeZone.</small>
          </div>
        </section>
      )}

      {isAdmin && (
        <AdminRequests
          session={session}
          requests={requests}
          reload={async () => setRequests(await getMembershipRequests())}
          notify={notify}
        />
      )}
    </div>
  )
}

export function EliteAreaPage({ session, navigate }) {
  const [state,setState] = useState(null)
  const [loading,setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false)
      return
    }
    getMembershipState(session.user.id)
      .then(setState)
      .finally(() => setLoading(false))
  }, [session?.user?.id])

  return (
    <section className="community-page community-page-wide elite-area-page">
      <div className="community-page-card">
        <header className="community-page-head">
          <button onClick={() => navigate('/')}>← Voltar</button>
          <h1>CreativeZone Elite Lounge</h1>
        </header>

        {loading ? (
          <p className="community-empty">Verificando seu acesso...</p>
        ) : !session ? (
          <div className="elite-locked"><Gem /><strong>Entre para acessar a área Elite.</strong><button className="action" onClick={() => navigate('/entrar')}>Entrar</button></div>
        ) : !state?.entitlements?.elite_area ? (
          <div className="elite-locked"><Gem /><strong>Área exclusiva para membros CreativeZone Elite.</strong><button className="action" onClick={() => navigate('/conta/assinatura')}>Ver planos</button></div>
        ) : (
          <div className="elite-lounge">
            <section><Sparkles /><div><strong>Early Access Lab</strong><small>Recursos experimentais e novidades aparecem aqui primeiro.</small></div></section>
            <section><Zap /><div><strong>Creator Toolkit</strong><small>Ferramentas premium e recursos extras para seus projetos e publicações.</small></div></section>
            <section><Gem /><div><strong>Identidade Elite</strong><small>Personalizações, molduras, títulos e benefícios exclusivos ativos.</small></div></section>
          </div>
        )}
      </div>
    </section>
  )
}
