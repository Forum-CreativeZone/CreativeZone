import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Award,
  CalendarDays,
  ChevronRight,
  Flame,
  Medal,
  Search,
  Sparkles,
  Tag,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  advancedForumSearch,
  getAchievementCatalog,
  getCommunityRankings,
  getPersonalizedFeed,
  getTagTopics,
  isFollowingTag,
  reputationLevel,
  toggleTagFollow,
} from './services/communityFeaturesApi'
import { getMemberDecorations } from './services/membershipApi'
import { EffectBadge, EffectName } from './VisualEffects'
import { ForumIcon } from './ForumIcon'

function FeatureShell({ title, onBack, children, wide = true }) {
  return (
    <section className={'standalone-page community-feature-page ' + (wide ? 'wide-page' : '')}>
      <div className="page-card feature-page-card">
        <header className="page-titlebar feature-titlebar">
          <div>
            <button className="page-back" onClick={onBack}><ArrowLeft /> Voltar</button>
            <h1>{title}</h1>
          </div>
        </header>
        {children}
      </div>
    </section>
  )
}

function MiniAvatar({ item, size = 44 }) {
  const name = item?.display_name || item?.username || item?.author_display_name || item?.author_username || 'M'
  const src = item?.avatar_url || item?.author_avatar_url
  return src
    ? <img className="feature-avatar" src={src} alt="" style={{ width:size,height:size }} />
    : <span className="feature-avatar feature-avatar-fallback" style={{ width:size,height:size }}>{name.slice(0,1).toUpperCase()}</span>
}

function FeedCard({ item, navigate, decoration }) {
  const cosmetics = decoration?.cosmetics || {}
  const membership = decoration?.membership || null
  return (
    <button
      className="personal-feed-card"
      data-profile-username={item.author_username || undefined}
      onClick={() => navigate('/topico/' + item.id)}
    >
      <MiniAvatar item={item} />
      <span className="personal-feed-main">
        <span className="personal-feed-meta">
          <EffectName
            as="strong"
            text={item.author_display_name || item.author_username || 'Membro'}
            effect={cosmetics.name_effect || 'clean'}
            color={cosmetics.name_color || null}
          />
          {membership?.plan_id && membership.plan_id !== 'free' && (
            <EffectBadge effect={cosmetics.badge_effect || 'clean-badge'} className="feed-vip-badge">
              {membership.badge}
            </EffectBadge>
          )}
          <small>{item.category_name || 'Fórum'}</small>
        </span>
        <b>{item.title}</b>
        <p>{String(item.content || '').replace(/\s+/g,' ').slice(0,180)}</p>
        <span className="personal-feed-tags">
          {(item.tags || []).slice(0,5).map((tag) => <i key={tag}>#{tag}</i>)}
        </span>
      </span>
      <span className="personal-feed-stats">
        <small>{Number(item.reply_count || 0)} respostas</small>
        <small>{Number(item.reaction_count || 0)} reações</small>
        <small>{Number(item.views || 0)} views</small>
      </span>
    </button>
  )
}

const feedModes = [
  ['recommended','Recomendados',Sparkles],
  ['following','Seguindo',UserPlus],
  ['community','Minha comunidade',Users],
  ['interests','Meus interesses',Tag],
]

export function PersonalizedFeed({ session, navigate }) {
  const [mode,setMode] = useState('recommended')
  const [items,setItems] = useState([])
  const [decorations,setDecorations] = useState({})
  const [loading,setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    if (!session?.user?.id) {
      setItems([])
      return undefined
    }
    setLoading(true)
    getPersonalizedFeed(mode,12,0)
      .then(async (rows) => {
        if (!alive) return
        setItems(rows)
        const ids = [...new Set(rows.map((item) => item.author_id).filter(Boolean))]
        if (!ids.length) {
          setDecorations({})
          return
        }
        try {
          const next = await getMemberDecorations(ids)
          if (alive) setDecorations(next)
        } catch {
          if (alive) setDecorations({})
        }
      })
      .catch(() => { if (alive) setItems([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive=false }
  }, [session?.user?.id,mode])

  if (!session?.user?.id) {
    return (
      <section className="personal-feed guest-personal-feed">
        <div>
          <Sparkles />
          <span><strong>Seu feed personalizado</strong><small>Entre para receber tópicos baseados em quem você segue, tags e interesses.</small></span>
        </div>
        <button className="action" onClick={() => navigate('/entrar')}>Entrar</button>
      </section>
    )
  }

  return (
    <section className="personal-feed">
      <header className="personal-feed-head">
        <div>
          <Sparkles />
          <span><strong>Para você</strong><small>Conteúdo personalizado da CreativeZone</small></span>
        </div>
        <div className="feed-quick-links">
          <button onClick={() => navigate('/ranking')}><Trophy /> Ranking</button>
          <button onClick={() => navigate('/conquistas')}><Award /> Conquistas</button>
        </div>
      </header>
      <nav className="personal-feed-tabs">
        {feedModes.map(([value,label,Icon]) => (
          <button key={value} className={mode===value?'active':''} onClick={() => setMode(value)}>
            <Icon /> {label}
          </button>
        ))}
      </nav>
      <div className="personal-feed-list">
        {loading ? <p className="feature-empty">Carregando seu feed...</p> : items.map((item) => (
          <FeedCard
            key={item.id}
            item={item}
            navigate={navigate}
            decoration={decorations[item.author_id]}
          />
        ))}
        {!loading && !items.length && <p className="feature-empty">Ainda não há conteúdo suficiente para esta seleção. Siga membros, tags ou adicione interesses ao seu perfil.</p>}
      </div>
    </section>
  )
}

export function RankingsPage({ navigate }) {
  const [period,setPeriod] = useState('weekly')
  const [rows,setRows] = useState([])
  const [month,setMonth] = useState([])
  const [decorations,setDecorations] = useState({})

  useEffect(() => {
    let alive=true
    Promise.all([
      getCommunityRankings(period,50),
      getCommunityRankings('monthly',3),
    ]).then(async ([next,monthRows]) => {
      if (!alive) return
      setRows(next)
      setMonth(monthRows)
      const ids = [...new Set([...next,...monthRows].map((item) => item.user_id).filter(Boolean))]
      try {
        const nextDecorations = ids.length ? await getMemberDecorations(ids) : {}
        if (alive) setDecorations(nextDecorations)
      } catch {
        if (alive) setDecorations({})
      }
    }).catch(() => {
      if (alive) { setRows([]);setMonth([]) }
    })
    return () => { alive=false }
  },[period])

  const monthlyWinner=month[0]

  return (
    <FeatureShell title="Ranking da comunidade" onBack={() => navigate('/')}>
      <div className="feature-content">
        {monthlyWinner && (
          <section
            className="member-of-month"
            data-profile-username={monthlyWinner.username || undefined}
          >
            <Flame />
            <MiniAvatar item={monthlyWinner} size={72} />
            <div>
              <span>Membro do mês</span>
              <EffectName
                as="h2"
                text={monthlyWinner.display_name || monthlyWinner.username}
                effect={decorations[monthlyWinner.user_id]?.cosmetics?.name_effect || 'clean'}
                color={decorations[monthlyWinner.user_id]?.cosmetics?.name_color || null}
              />
              <p>{monthlyWinner.period_xp} XP neste mês · {monthlyWinner.level}</p>
            </div>
          </section>
        )}

        <div className="ranking-period-tabs">
          {[['weekly','Semanal'],['monthly','Mensal'],['all','Geral']].map(([value,label]) => (
            <button key={value} className={period===value?'active':''} onClick={() => setPeriod(value)}>{label}</button>
          ))}
        </div>

        <div className="ranking-list">
          {rows.map((row,index) => (
            <button
              key={row.user_id}
              data-profile-username={row.username || undefined}
              onClick={() => row.username && navigate('/membro/' + encodeURIComponent(row.username))}
            >
              <span className={'rank-number rank-' + Math.min(index+1,4)}>
                {index < 3
                  ? <ForumIcon icon="tabler:medal" className={'ranking-medal-icon medal-' + (index + 1)} />
                  : '#'+row.rank}
              </span>
              <MiniAvatar item={row} />
              <span className="ranking-person">
                <EffectName
                  as="strong"
                  text={row.display_name || row.username}
                  effect={decorations[row.user_id]?.cosmetics?.name_effect || 'clean'}
                  color={decorations[row.user_id]?.cosmetics?.name_color || null}
                />
                <small>@{row.username} · {row.level}</small>
              </span>
              <span className="ranking-score"><b>{row.period_xp}</b><small>XP no período</small></span>
              <span className="ranking-total"><b>{row.reputation}</b><small>XP total</small></span>
            </button>
          ))}
          {!rows.length && <p className="feature-empty">O ranking começará a aparecer conforme a comunidade participar.</p>}
        </div>
      </div>
    </FeatureShell>
  )
}

const levels=[
  ['Novato',0],
  ['Membro',50],
  ['Especialista',200],
  ['Mestre',500],
  ['Lenda',1000],
]

export function AchievementsPage({ session, navigate }) {
  const [data,setData] = useState(null)

  useEffect(() => {
    let alive=true
    getAchievementCatalog(session?.user?.id || null)
      .then((next) => { if (alive) setData(next) })
      .catch(() => { if (alive) setData({ profile:null,badges:[] }) })
    return () => { alive=false }
  },[session?.user?.id])

  const xp=Number(data?.profile?.reputation || 0)
  const current=reputationLevel(xp)
  const nextLevel=levels.find(([,threshold]) => threshold>xp)
  const progress=nextLevel
    ? Math.max(0,Math.min(100,Math.round((xp/(nextLevel[1]||1))*100)))
    : 100

  return (
    <FeatureShell title="Conquistas e níveis" onBack={() => navigate('/')}>
      <div className="feature-content">
        <section className="achievement-level-card">
          <Trophy />
          <div>
            <span>Seu nível</span>
            <h2>{session ? current : 'Entre para acompanhar seu progresso'}</h2>
            {session && <p>{xp} XP {nextLevel ? '· próximo nível: '+nextLevel[0]+' em '+nextLevel[1]+' XP' : '· nível máximo alcançado'}</p>}
            {session && <div className="xp-progress"><i style={{ width:progress+'%' }} /></div>}
          </div>
        </section>

        <div className="level-ladder">
          {levels.map(([name,threshold]) => (
            <div key={name} className={xp>=threshold && session ? 'reached':''}>
              <Medal />
              <strong>{name}</strong>
              <small>{threshold} XP</small>
            </div>
          ))}
        </div>

        <h2 className="feature-section-title">Medalhas da CreativeZone</h2>
        <div className="achievement-grid">
          {(data?.badges || []).map((badge) => (
            <article key={badge.id} className={badge.earned?'earned':'locked'}>
              <span className="animated-medal">{badge.icon}</span>
              <div><strong>{badge.name}</strong><p>{badge.description}</p><small>{badge.earned ? 'Conquistada' : badge.points ? badge.points+' pontos de referência' : 'Bloqueada'}</small></div>
            </article>
          ))}
        </div>
      </div>
    </FeatureShell>
  )
}

export function TagPage({ slug, session, navigate }) {
  const [data,setData] = useState({ tag:null,topics:[] })
  const [following,setFollowing] = useState(false)

  async function load() {
    const next=await getTagTopics(slug,60)
    setData(next)
    if (session?.user?.id && next.tag?.id) {
      setFollowing(await isFollowingTag(session.user.id,next.tag.id))
    }
  }
  useEffect(() => { load().catch(() => setData({tag:null,topics:[]})) },[slug,session?.user?.id])

  async function follow() {
    if (!session?.user?.id) return navigate('/entrar')
    const next=await toggleTagFollow(session.user.id,data.tag.id)
    setFollowing(next)
  }

  return (
    <FeatureShell title={data.tag ? '#'+data.tag.name : '#'+slug} onBack={() => navigate('/')}>
      <div className="feature-content">
        <header className="tag-page-head">
          <div><Tag /><span><strong>{data.tag?.name || slug}</strong><small>{data.tag?.description || 'Discussões relacionadas a esta tag.'}</small></span></div>
          {data.tag && <button className={'action '+(following?'primary-action':'')} onClick={follow}>{following?'Seguindo tag':'Seguir tag'}</button>}
        </header>
        <div className="tag-topic-list">
          {data.topics.map((topic) => (
            <button key={topic.id} onClick={() => navigate('/topico/'+topic.id)}>
              <strong>{topic.title}</strong>
              <span data-profile-username={topic.profiles?.username || undefined}>
                {topic.profiles?.display_name || topic.profiles?.username || 'Membro'} · {topic.categories?.name || 'Fórum'}
              </span>
              <p>{String(topic.content||'').replace(/\s+/g,' ').slice(0,220)}</p>
              <ChevronRight />
            </button>
          ))}
          {!data.topics.length && <p className="feature-empty">Nenhum tópico usa esta tag ainda.</p>}
        </div>
      </div>
    </FeatureShell>
  )
}

export function AdvancedSearchPage({ categories, navigate, initialQuery = '' }) {
  const [filters,setFilters] = useState({
    query:initialQuery,
    categoryId:'',
    author:'',
    dateFrom:'',
    dateTo:'',
    sort:'relevance',
  })
  const [rows,setRows] = useState([])
  const [loading,setLoading] = useState(false)
  const [searched,setSearched] = useState(false)

  async function search(event) {
    event?.preventDefault()
    setLoading(true)
    setSearched(true)
    try {
      const next=await advancedForumSearch({
        ...filters,
        categoryId:filters.categoryId || null,
        dateFrom:filters.dateFrom || null,
        dateTo:filters.dateTo || null,
      })
      setRows(next)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialQuery?.trim().length>=2) search()
  },[])

  function field(name,value) {
    setFilters((current) => ({ ...current,[name]:value }))
  }

  return (
    <FeatureShell title="Busca avançada" onBack={() => navigate('/')}>
      <div className="feature-content">
        <form className="advanced-search-form" onSubmit={search}>
          <label className="search-wide"><span>Palavras-chave</span><div><Search /><input value={filters.query} onChange={(e)=>field('query',e.target.value)} placeholder="Tópico, conteúdo ou tag" /></div></label>
          <label><span>Categoria</span><select value={filters.categoryId} onChange={(e)=>field('categoryId',e.target.value)}><option value="">Todas</option>{categories.map((category)=><option value={category.id} key={category.id}>{category.pathLabel || category.name}</option>)}</select></label>
          <label><span>Autor</span><input value={filters.author} onChange={(e)=>field('author',e.target.value)} placeholder="@usuário ou nome" /></label>
          <label><span>De</span><input type="date" value={filters.dateFrom} onChange={(e)=>field('dateFrom',e.target.value)} /></label>
          <label><span>Até</span><input type="date" value={filters.dateTo} onChange={(e)=>field('dateTo',e.target.value)} /></label>
          <label><span>Ordenar por</span><select value={filters.sort} onChange={(e)=>field('sort',e.target.value)}><option value="relevance">Relevância</option><option value="recent">Mais recentes</option><option value="commented">Mais comentados</option></select></label>
          <button className="action primary-action" disabled={loading}><Search /> {loading?'Buscando...':'Buscar'}</button>
        </form>

        <div className="advanced-search-results">
          {rows.map((row) => (
            <button key={row.id} onClick={() => navigate('/topico/'+row.id)}>
              <span>
                <strong>{row.title}</strong>
                <small data-profile-username={row.author_username || undefined}>
                  {row.author_display_name || row.author_username || 'Membro'} · {row.category_name} · {row.reply_count} respostas
                </small>
              </span>
              <p>{row.excerpt}</p>
              <div>{(row.tags||[]).map((tag)=><i key={tag}>#{tag}</i>)}</div>
            </button>
          ))}
          {searched && !loading && !rows.length && <p className="feature-empty">Nenhum resultado corresponde aos filtros escolhidos.</p>}
          {!searched && <p className="feature-empty">Use os filtros acima para localizar discussões com precisão.</p>}
        </div>
      </div>
    </FeatureShell>
  )
}
