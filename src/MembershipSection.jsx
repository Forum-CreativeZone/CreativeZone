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
  getVisualEffectCatalog,
  getHistoricalBadgeAdminData,
  manageHistoricalBadge,
  rejectMembershipRequest,
  requestMembershipUpgrade,
  saveProfileCosmetics,
} from './services/membershipApi'
import { EffectPreview } from './VisualEffects'

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value))
}

function formatMoney(cents = 0, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format((Number(cents) || 0) / 100)
}

const WHATSAPP_NUMBER = '5511932212697'

const benefits = [
  ['early_access','Acesso antecipado a recursos'],
  ['elite_area','Área Elite'],
  ['creator_tools','Ferramentas extras para criadores'],
  ['ads_free','Experiência sem anúncios'],
]

function PlanCard({ plan, current, onRequest, busy, months, setMonths }) {
  const active = current?.plan_id === plan.id
  const e = plan.entitlements || {}
  const paid = plan.id !== 'free'
  const permanentCurrent = active && current?.permanent
  const lowerThanCurrent = paid && current?.plan_id && current.plan_id !== 'free' && plan.rank < (current?.rank ?? 0)
  const total = (plan.price_cents || 0) * (Number(months) || 1)

  return (
    <article className={'membership-plan-card plan-' + plan.id + (active ? ' active' : '')}>
      <header>
        <span className="membership-plan-icon">
          {plan.id === 'elite' ? <Gem /> : plan.id === 'pro' ? <Crown /> : <Star />}
        </span>
        <div>
          <strong>{plan.name}</strong>
          <small>{plan.description}</small>
          <span className="membership-price">
            {paid ? <><b>{formatMoney(plan.price_cents,plan.currency)}</b><small>/mês</small></> : <b>Grátis</b>}
          </span>
        </div>
        <b>{plan.badge}</b>
      </header>

      <div className="membership-plan-benefits">
        <span><Check /> {e.featured_projects ?? 3} projetos destacados</span>
        <span><Check /> Anexos de até {e.forum_upload_mb ?? 10} MB</span>
        <span><Check /> Até {e.forum_upload_count ?? 4} anexos por publicação</span>
        <span className={plan.rank >= 1 ? '' : 'muted'}>
          {plan.rank >= 1 ? <Check /> : <X />} Efeitos de nome PRO
        </span>
        {benefits.map(([key,label]) => (
          <span className={e[key] ? '' : 'muted'} key={key}>
            {e[key] ? <Check /> : <X />} {label}
          </span>
        ))}
      </div>

      {paid && !permanentCurrent && !lowerThanCurrent && (
        <div className="membership-buy-box">
          <label>
            Período
            <select value={months} onChange={(event)=>setMonths(Number(event.target.value))}>
              {[1,2,3,6,12].map((value)=>(
                <option key={value} value={value}>{value} mês{value>1?'es':''}</option>
              ))}
            </select>
          </label>
          <div>
            <span>Total</span>
            <strong>{formatMoney(total,plan.currency)}</strong>
          </div>
          <button
            className="action membership-request-button whatsapp"
            disabled={busy}
            onClick={() => onRequest(plan.id,months)}
          >
            Continuar com WhatsApp
          </button>
        </div>
      )}

      {permanentCurrent && <button className="membership-current" disabled>Plano permanente</button>}
      {!paid && active && <button className="membership-current" disabled>Plano atual</button>}
      {lowerThanCurrent && <small className="membership-downgrade-note">Seu plano atual já possui benefícios superiores.</small>}
    </article>
  )
}

const effectTiers = [
  [1,'PRO','Efeitos de nome'],
]

function EffectGallery({
  effects,
  value,
  onChange,
  rank,
  owner,
  name,
}) {
  const available = effects.filter((item) => item.kind === 'name' && item.min_rank === 1)

  return (
    <section className="effect-gallery effect-gallery-name">
      {effectTiers.map(([tier,label,subtitle]) => {
        const items = available.filter((item) => item.min_rank === tier)
        if (!items.length) return null

        return (
          <div className="effect-tier effect-tier-pro" key={label}>
            <header>
              <div><strong>{label}</strong><small>{subtitle}</small></div>
              <span>{items.length} efeito{items.length === 1 ? '' : 's'}</span>
            </header>
            <div className="effect-option-grid">
              {items.map((item) => {
                const locked = (!owner && item.owner_only) || (!owner && rank < 1)
                const selected = value === item.effect_id

                return (
                  <button
                    type="button"
                    className={
                      'effect-option ' +
                      (selected ? 'selected ' : '') +
                      (locked ? 'locked ' : '') +
                      (item.animated ? 'animated ' : '') +
                      (item.interactive ? 'interactive' : '')
                    }
                    key={item.effect_id}
                    disabled={locked}
                    onClick={() => onChange(item.effect_id)}
                    title={locked
                      ? item.owner_only
                        ? 'Efeito exclusivo do Arquiteto CreativeZone.'
                        : 'Disponível no plano CreativeZone PRO.'
                      : item.description}
                  >
                    <div className="effect-option-preview">
                      <EffectPreview
                        kind="name"
                        effect={item.effect_id}
                        name={name}
                      />
                    </div>
                    <span className="effect-option-copy">
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span className="effect-tier-chip tier-pro">
                      {item.owner_only ? 'ARQUITETO' : 'PRO'}
                    </span>
                    {locked && <i className="effect-lock">Bloqueado</i>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function CosmeticsForm({ state, profile, effects, cosmetics, setCosmetics, onSave, busy }) {
  const owner = Boolean(state?.system_owner)
  const rank = owner ? 99 : Number(state?.rank || 0)
  const displayName = profile?.display_name || profile?.username || 'CreativeZone'

  function chooseNameEffect(value) {
    setCosmetics((current) => ({
      ...current,
      name_effect: value,
      name_color: null,
      profile_title: null,
      avatar_frame: 'avatar-clean',
      cover_effect: 'cover-clean',
      badge_style: 'default',
      badge_effect: 'clean-badge',
      role_effect: 'clean-role',
      profile_effect: 'none',
    }))
  }

  if (!owner && rank < 1) {
    return (
      <section className="membership-cosmetics premium-identity-studio">
        <header className="identity-studio-head">
          <Sparkles />
          <div>
            <strong>CreativeZone Effects Studio</strong>
            <small>O plano FREE não possui personalização estética. Sua identidade visual usa somente a foto de perfil.</small>
          </div>
        </header>
      </section>
    )
  }

  return (
    <form className="membership-cosmetics premium-identity-studio" onSubmit={onSave}>
      <header className="identity-studio-head">
        <Sparkles />
        <div>
          <strong>CreativeZone Effects Studio</strong>
          <small>
            A personalização estética foi simplificada: somente efeitos de nome estão disponíveis, todos na categoria PRO.
          </small>
        </div>
      </header>

      <div className="identity-live-preview identity-live-preview-v2">
        <div className="identity-live-primary">
          <span>Preview ao vivo</span>
          <EffectPreview
            kind="name"
            effect={cosmetics.name_effect || 'clean'}
            name={displayName}
          />
        </div>
      </div>

      <section className="identity-effect-section">
        <header>
          <strong>Efeitos do nome</strong>
          <small>Todos os efeitos anteriormente PRO e ELITE agora pertencem ao catálogo PRO. O plano ELITE não possui efeitos exclusivos nesta etapa.</small>
        </header>
        <EffectGallery
          effects={effects}
          value={cosmetics.name_effect || 'clean'}
          onChange={chooseNameEffect}
          rank={rank}
          owner={owner}
          name={displayName}
        />
      </section>

      <footer className="identity-studio-save">
        <span>
          {owner
            ? 'Arquiteto CreativeZone: acesso aos efeitos de nome PRO e ao efeito exclusivo de proprietário.'
            : state?.plan_id === 'elite'
              ? 'ELITE: pode usar o catálogo de nomes PRO; não há efeitos exclusivos ELITE.'
              : 'PRO: catálogo completo de efeitos de nome liberado.'}
        </span>
        <button className="action primary-action" disabled={busy}>
          <Sparkles /> Salvar efeito do nome
        </button>
      </footer>
    </form>
  )
}

function AdminRequests({ session, requests, reload, notify }) {
  const [busyId,setBusyId] = useState(null)

  async function approve(request, permanent) {
    setBusyId(request.id)
    try {
      await adminGrantMembership({
        userId: request.user_id,
        planId: request.plan_id,
        permanent,
        months: request.months_requested || 1,
        requestId: request.id,
      })
      notify(permanent
        ? 'Plano permanente concedido.'
        : 'Plano concedido por ' + (request.months_requested || 1) + ' mês(es).')
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
            <small>
              @{request.profile?.username || 'membro'} · {request.plan?.badge || request.plan_id.toUpperCase()}
              {' · '}{request.months_requested || 1} mês(es)
              {request.reference_code ? ' · ' + request.reference_code : ''}
            </small>
            <b>{formatMoney(request.total_price_cents || 0,request.currency || 'BRL')}</b>
            {request.message && <p>{request.message}</p>}
          </div>
          <div>
            <button className="action" disabled={busyId===request.id} onClick={() => approve(request,false)}>
              Aprovar {request.months_requested || 1} mês(es)
            </button>
            <button className="action primary-action" disabled={busyId===request.id} onClick={() => approve(request,true)}>Permanente</button>
            <button className="action danger-action" disabled={busyId===request.id} onClick={() => reject(request)}>Recusar</button>
          </div>
        </article>
      ))}
      {!pending.length && <p className="community-empty">Nenhuma solicitação de upgrade pendente.</p>}
    </section>
  )
}


function AdminHistoricalBadges({ notify }) {
  const [data,setData] = useState({ profiles:[],badges:[],awards:[] })
  const [busy,setBusy] = useState('')

  async function reload() {
    setData(await getHistoricalBadgeAdminData())
  }

  useEffect(() => {
    reload().catch(() => {})
  }, [])

  const active = useMemo(
    () => new Set(data.awards.map((award) => award.user_id + ':' + award.badge_id)),
    [data.awards]
  )

  async function toggle(profile, badge) {
    const key = profile.id + ':' + badge.id
    const granted = active.has(key)
    setBusy(key)
    try {
      await manageHistoricalBadge(profile.id,badge.slug,!granted)
      notify((granted ? 'Insígnia removida: ' : 'Insígnia concedida: ') + badge.name + '.')
      await reload()
    } catch (error) {
      notify(error?.message || 'Não foi possível alterar a insígnia.')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="historical-badge-admin">
      <header>
        <Star />
        <div>
          <strong>Insígnias históricas</strong>
          <small>Beta Tester, Pioneiro e Early Supporter são concedidas manualmente pela administração.</small>
        </div>
      </header>

      <div className="historical-badge-member-list">
        {data.profiles.map((profile) => (
          <article key={profile.id}>
            <div className="historical-member-name">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" />
                : <span>{(profile.display_name || profile.username || 'M').slice(0,1).toUpperCase()}</span>}
              <div>
                <strong>{profile.display_name || profile.username}</strong>
                <small>@{profile.username}{profile.system_owner ? ' · Arquiteto' : ''}</small>
              </div>
            </div>
            <div className="historical-badge-actions">
              {data.badges.map((badge) => {
                const key = profile.id + ':' + badge.id
                const granted = active.has(key)
                return (
                  <button
                    type="button"
                    key={badge.id}
                    className={'historical-badge-toggle ' + (granted ? 'active' : '')}
                    disabled={busy===key}
                    onClick={() => toggle(profile,badge)}
                    title={badge.description}
                  >
                    <span>{badge.icon}</span> {badge.name}
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

export function MembershipSection({ session, profile, state, setState, notify }) {
  const [plans,setPlans] = useState([])
  const [cosmetics,setCosmetics] = useState({
    name_color:null,
    profile_title:null,
    avatar_frame:'avatar-clean',
    cover_effect:'cover-clean',
    badge_style:'default',
    name_effect:'clean',
    badge_effect:'clean-badge',
    role_effect:'clean-role',
    profile_effect:'none',
  })
  const [effects,setEffects] = useState([])
  const [requests,setRequests] = useState([])
  const [planMonths,setPlanMonths] = useState({ pro:1, elite:1 })
  const [busy,setBusy] = useState(false)

  const isAdmin = profile?.role === 'admin'
  async function reload() {
    if (!session?.user?.id) return
    const tasks = [
      getMembershipPlans(),
      getMembershipState(session.user.id),
      getProfileCosmetics(session.user.id),
      getVisualEffectCatalog(),
    ]
    if (isAdmin) tasks.push(getMembershipRequests())

    const [nextPlans,nextState,nextCosmetics,nextEffects,nextRequests] = await Promise.all(tasks)
    setPlans(nextPlans)
    setState?.(nextState ? {
      ...nextState,
      rank: nextPlans.find((plan)=>plan.id===nextState.plan_id)?.rank ?? 0,
    } : nextState)
    setCosmetics(nextCosmetics || {
      name_color:null,
      profile_title:null,
      avatar_frame:'avatar-clean',
      cover_effect:'cover-clean',
      badge_style:'default',
      name_effect:'clean',
      badge_effect:'clean-badge',
      role_effect:'clean-role',
      profile_effect:'none',
    })
    setEffects(nextEffects || [])
    if (isAdmin) setRequests(nextRequests || [])
  }

  useEffect(() => {
    reload().catch((error) => notify(error?.message || 'Não foi possível carregar os planos.'))
  }, [session?.user?.id,isAdmin])

  async function request(planId, months = 1) {
    const plan = plans.find((item) => item.id === planId)
    if (!plan) return

    const whatsappWindow = window.open('about:blank', '_blank')
    if (whatsappWindow) whatsappWindow.opener = null

    setBusy(true)
    try {
      const purchase = await requestMembershipUpgrade(
        session.user.id,
        planId,
        months,
        'Solicitação iniciada pela página Assinatura & VIP.'
      )

      const accountName = profile?.display_name || profile?.username || 'Membro'
      const username = profile?.username || 'membro'
      const email = session?.user?.email || ''
      const message = [
        'Olá! Quero apoiar a CreativeZone e ativar/renovar meu VIP.',
        '',
        'Referência: ' + purchase.reference_code,
        'Plano: ' + purchase.plan_name + ' (' + purchase.badge + ')',
        'Período: ' + purchase.months + ' mês(es)',
        'Valor total: ' + formatMoney(purchase.total_price_cents,purchase.currency),
        '',
        'Conta CreativeZone:',
        'Nome: ' + accountName,
        'Usuário: @' + username,
        'E-mail: ' + email,
        'ID da conta: ' + session.user.id,
        '',
        'Vou enviar por aqui o comprovante do pagamento.',
      ].join('\n')

      const whatsappUrl = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message)
      if (whatsappWindow) {
        whatsappWindow.location.href = whatsappUrl
      } else {
        window.location.href = whatsappUrl
      }
      notify('Pedido criado. Continue pelo WhatsApp e envie o comprovante.')
      if (isAdmin) setRequests(await getMembershipRequests())
    } catch (error) {
      whatsappWindow?.close()
      notify(error?.message || 'Não foi possível iniciar a solicitação.')
    } finally {
      setBusy(false)
    }
  }

  function supportWithoutVip() {
    const message = [
      'Olá! Quero fazer uma contribuição avulsa para apoiar a CreativeZone.',
      '',
      'Conta: @' + (profile?.username || 'membro'),
      'Nome: ' + (profile?.display_name || profile?.username || 'Membro'),
      'E-mail: ' + (session?.user?.email || ''),
      'ID da conta: ' + session.user.id,
      '',
      'Pode me orientar sobre o pagamento?',
    ].join('\n')
    window.open(
      'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message),
      '_blank',
      'noopener,noreferrer'
    )
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
            months={planMonths[plan.id] || 1}
            setMonths={(value)=>setPlanMonths((current)=>({...current,[plan.id]:value}))}
          />
        ))}
      </div>

      <section className="membership-support-note">
        <div>
          <strong>❤️ Apoiar sem assinatura</strong>
          <small>
            Se você só quer ajudar com a VPS, infraestrutura e futuros projetos, também pode fazer uma contribuição avulsa.
          </small>
        </div>
        <button className="action" onClick={supportWithoutVip}>Falar pelo WhatsApp</button>
      </section>

      <section className="membership-transparency">
        <strong>Como o apoio é utilizado</strong>
        <p>
          As assinaturas ajudam a manter VPS, banco, armazenamento e serviços da comunidade, além de financiar a evolução da CreativeZone e novos projetos.
          VIP não compra XP, reputação, autoridade ou poder de moderação.
        </p>
      </section>

      <CosmeticsForm
        state={state}
        profile={profile}
        effects={effects}
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
        <>
          <AdminRequests
            session={session}
            requests={requests}
            reload={async () => setRequests(await getMembershipRequests())}
            notify={notify}
          />
          <AdminHistoricalBadges notify={notify} />
        </>
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
            <section><Gem /><div><strong>Benefícios Elite</strong><small>Área exclusiva, ferramentas extras e recursos antecipados ativos. Os efeitos de nome pertencem ao catálogo PRO compartilhado.</small></div></section>
          </div>
        )}
      </div>
    </section>
  )
}
