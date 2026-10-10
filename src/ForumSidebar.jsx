import React from 'react'
import {
  Award,
  BarChart3,
  BriefcaseBusiness,
  ChevronRight,
  Flame,
  FolderTree,
  MessageSquareText,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react'
import { CategorySuggestionButton } from './CategoryPages'
import { buildTopicPath } from './seo'

const compactNumber = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function formatNumber(value) {
  const number = Number(value || 0)
  return compactNumber.format(Number.isFinite(number) ? number : 0)
}

function formatRelative(value) {
  if (!value) return ''
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const diff = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days} dia${days === 1 ? '' : 's'}`
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value))
}

function MemberAvatar({ member, size = 34 }) {
  const name = member?.display_name || member?.username || 'Membro'
  const src = member?.avatar_url
  return src ? (
    <img
      className="forum-side-avatar"
      src={src}
      alt=""
      width={size}
      height={size}
    />
  ) : (
    <span
      className="forum-side-avatar forum-side-avatar-fallback"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function TopicLink({ topic, navigate, onOpenTopic, showViews = false }) {
  if (!topic?.id) return null
  const href = buildTopicPath(topic)
  const actor = {
    avatar_url: topic.lastActorAvatarUrl || topic.avatarUrl || topic.author_avatar_url || '',
    display_name: topic.lastActorName || topic.user || topic.author_display_name || '',
    username: topic.lastActorUsername || topic.authorUsername || topic.author_username || '',
  }
  return (
    <a
      className="forum-side-topic"
      href={href}
      data-profile-username={actor.username || undefined}
      onClick={(event) => {
        event.preventDefault()
        if (onOpenTopic) onOpenTopic(topic)
        else navigate(href)
      }}
    >
      <MemberAvatar member={actor} size={32} />
      <span>
        <strong>{topic.title}</strong>
        <small>
          {topic.category || 'Fórum'}
          {' · '}
          {showViews
            ? `${formatNumber(topic.views)} visualizações`
            : `${formatNumber(topic.replies)} respostas`}
        </small>
      </span>
      <ChevronRight />
    </a>
  )
}

function SideCard({ title, icon: Icon, children, className = '', action = null }) {
  return (
    <section className={'forum-side-card ' + className}>
      <header className="forum-side-card-head">
        <span>
          {Icon && <Icon />}
          <strong>{title}</strong>
        </span>
        {action}
      </header>
      <div className="forum-side-card-body">{children}</div>
    </section>
  )
}

export function ForumSidebar({
  categories = [],
  onlineMembers = [],
  trendingTopics = [],
  recentTopics = [],
  stats = {},
  session,
  navigate,
  notify,
  onOpenTopic,
}) {
  const rootCategories = categories
    .filter((category) => !category.parent_id && category.node_type === 'category')
    .sort((a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    )

  const visibleOnline = onlineMembers.slice(0, 8)
  const remainingOnline = Math.max(0, onlineMembers.length - visibleOnline.length)
  const latestMember = stats.latest_member_username
    ? {
        username: stats.latest_member_username,
        display_name: stats.latest_member_display_name,
        avatar_url: stats.latest_member_avatar_url,
      }
    : null

  return (
    <div className="forum-sidebar-stack">
      <SideCard title="Comunidade agora" icon={Users} className="forum-side-live">
        <div className="forum-side-online-summary">
          <span className="forum-side-live-dot" />
          <strong>{formatNumber(onlineMembers.length)} online agora</strong>
        </div>

        {visibleOnline.length ? (
          <div className="forum-side-online-list">
            {visibleOnline.map((member) => {
              const username = member.username || ''
              const label = member.display_name || username || 'Membro'
              const href = username ? '/membro/' + encodeURIComponent(username) : '/membros'
              return (
                <a
                  key={member.user_id || username || label}
                  href={href}
                  data-profile-username={username || undefined}
                  onClick={(event) => {
                    event.preventDefault()
                    navigate(href)
                  }}
                  title={label}
                >
                  <MemberAvatar member={member} />
                  <span>
                    <strong>{label}</strong>
                    <small>@{username || 'membro'}</small>
                  </span>
                </a>
              )
            })}
            {remainingOnline > 0 && (
              <button
                type="button"
                className="forum-side-online-more"
                onClick={() => navigate('/membros')}
              >
                +{remainingOnline}
              </button>
            )}
          </div>
        ) : (
          <p className="forum-side-empty">A presença dos membros aparecerá aqui em tempo real.</p>
        )}
      </SideCard>

      <SideCard title="Em alta" icon={Flame} className="forum-side-trending">
        {trendingTopics.length ? (
          trendingTopics.slice(0, 5).map((topic) => (
            <TopicLink
              key={topic.id}
              topic={topic}
              navigate={navigate}
              onOpenTopic={onOpenTopic}
              showViews
            />
          ))
        ) : (
          <p className="forum-side-empty">Os tópicos mais vistos aparecerão aqui.</p>
        )}
      </SideCard>

      <SideCard title="Últimas publicações" icon={MessageSquareText} className="forum-side-recent">
        {recentTopics.length ? (
          recentTopics.slice(0, 5).map((topic) => (
            <TopicLink
              key={topic.id}
              topic={topic}
              navigate={navigate}
              onOpenTopic={onOpenTopic}
            />
          ))
        ) : (
          <p className="forum-side-empty">Nenhuma publicação recente ainda.</p>
        )}
      </SideCard>

      <SideCard
        title="Categorias"
        icon={FolderTree}
        className="forum-side-categories"
        action={
          <button
            type="button"
            className="forum-side-head-action"
            aria-label="Ver todas as categorias"
            onClick={() => navigate('/categorias')}
          >
            <ChevronRight />
          </button>
        }
      >
        <nav className="forum-side-category-list" aria-label="Categorias principais">
          {rootCategories.map((category) => {
            const href = '/forum/' + encodeURIComponent(category.slug)
            return (
              <a
                key={category.id}
                href={href}
                onClick={(event) => {
                  event.preventDefault()
                  navigate(href)
                }}
              >
                <span>{category.name}</span>
                <small>Categoria</small>
                <ChevronRight />
              </a>
            )
          })}
          {!rootCategories.length && (
            <p className="forum-side-empty">Nenhuma categoria principal criada ainda.</p>
          )}
        </nav>
        <CategorySuggestionButton
          session={session}
          navigate={navigate}
          notify={notify}
          className="forum-side-category-suggest"
          label="Sugerir categoria"
        />
      </SideCard>

      <SideCard title="Estatísticas do fórum" icon={BarChart3} className="forum-side-stats">
        <div className="forum-side-stat-grid">
          <span><b>{formatNumber(stats.topic_count)}</b><small>Tópicos</small></span>
          <span><b>{formatNumber(stats.post_count)}</b><small>Respostas</small></span>
          <span><b>{formatNumber(stats.member_count)}</b><small>Membros</small></span>
          <span><b>{formatNumber(stats.total_views)}</b><small>Visualizações</small></span>
          <span><b>{formatNumber(stats.reaction_count)}</b><small>Reações</small></span>
          <span><b>{formatNumber(stats.root_category_count)}</b><small>Categorias</small></span>
        </div>

        {latestMember && (
          <a
            className="forum-side-new-member"
            href={'/membro/' + encodeURIComponent(latestMember.username)}
            data-profile-username={latestMember.username}
            onClick={(event) => {
              event.preventDefault()
              navigate('/membro/' + encodeURIComponent(latestMember.username))
            }}
          >
            <MemberAvatar member={latestMember} size={38} />
            <span>
              <small>Membro mais recente</small>
              <strong>{latestMember.display_name || latestMember.username}</strong>
              {stats.latest_member_created_at && (
                <em>{formatRelative(stats.latest_member_created_at)}</em>
              )}
            </span>
            <ChevronRight />
          </a>
        )}
      </SideCard>

      <SideCard title="Explore a CreativeZone" icon={Sparkles} className="forum-side-explore">
        <div className="forum-side-explore-grid">
          <a
            href="/ranking"
            onClick={(event) => { event.preventDefault(); navigate('/ranking') }}
          >
            <Trophy /><span><strong>Ranking</strong><small>Quem está em destaque</small></span>
          </a>
          <a
            href="/conquistas"
            onClick={(event) => { event.preventDefault(); navigate('/conquistas') }}
          >
            <Award /><span><strong>Conquistas</strong><small>Níveis e medalhas</small></span>
          </a>
          <a
            href="/projetos"
            onClick={(event) => { event.preventDefault(); navigate('/projetos') }}
          >
            <BriefcaseBusiness /><span><strong>Projetos</strong><small>Criações da comunidade</small></span>
          </a>
          <a
            href="/membros"
            onClick={(event) => { event.preventDefault(); navigate('/membros') }}
          >
            <Users /><span><strong>Membros</strong><small>Conheça a comunidade</small></span>
          </a>
        </div>
      </SideCard>
    </div>
  )
}
