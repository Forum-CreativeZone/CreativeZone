const DEFAULT_SITE_URL = 'https://assets-forum.gestao-quiroz.workers.dev'
const DEFAULT_TITLE = 'CreativeZone — Comunidade Creative Lab'
const DEFAULT_DESCRIPTION = 'Comunidade CreativeZone para tecnologia, software, hardware, IA, automação, games, projetos e colaboração entre membros.'
const DEFAULT_IMAGE = 'https://raw.githubusercontent.com/Inosuke-Company/CreativeZone/main/assets/banner.png'

export function getPublicSiteUrl() {
  const configured = String(import.meta.env.VITE_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '')
  return configured || DEFAULT_SITE_URL
}

export function plainText(value = '') {
  return String(value)
    .replace(/\[attachment:[^\]]+\]/gi, ' ')
    .replace(/\[\/?(?:quote|code|spoiler|url|img|b|i|u|s)(?:=[^\]]+)?\]/gi, ' ')
    .replace(/[#*_~>]+/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncateText(value = '', max = 158) {
  const text = plainText(value)
  if (text.length <= max) return text
  const shortened = text.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/, '').trim()
  return (shortened || text.slice(0, max - 1)).trim() + '…'
}

function fallbackSlug(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110)
}

export function buildTopicPath(topic) {
  if (!topic?.id) return '/topico'
  const slug = String(topic.slug || fallbackSlug(topic.title) || 'topico').trim()
  return '/topico/' + encodeURIComponent(slug + '--' + topic.id)
}

export function parseTopicRouteId(segment = '') {
  const value = decodeURIComponent(String(segment || '')).trim()
  const uuidAtEnd = value.match(/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i)
  return uuidAtEnd?.[1] || value
}

function upsertMeta(attribute, key, content) {
  if (!content) return
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

function upsertCanonical(href) {
  let element = document.head.querySelector('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', 'canonical')
    document.head.appendChild(element)
  }
  element.setAttribute('href', href)
}

function setJsonLd(value) {
  const id = 'creativezone-route-structured-data'
  document.getElementById(id)?.remove()
  if (!value) return
  const script = document.createElement('script')
  script.id = id
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify(value)
  document.head.appendChild(script)
}

export function applySeo({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  canonicalPath = '/',
  canonicalUrl,
  image = DEFAULT_IMAGE,
  type = 'website',
  robots = 'index,follow,max-image-preview:large',
  jsonLd = null,
} = {}) {
  const siteUrl = getPublicSiteUrl()
  const canonical = canonicalUrl || new URL(canonicalPath || '/', siteUrl + '/').href
  const safeDescription = truncateText(description || DEFAULT_DESCRIPTION, 170) || DEFAULT_DESCRIPTION

  document.title = title
  upsertMeta('name', 'description', safeDescription)
  upsertMeta('name', 'robots', robots)
  upsertCanonical(canonical)

  upsertMeta('property', 'og:type', type)
  upsertMeta('property', 'og:site_name', 'CreativeZone')
  upsertMeta('property', 'og:locale', 'pt_BR')
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', safeDescription)
  upsertMeta('property', 'og:url', canonical)
  upsertMeta('property', 'og:image', image)

  upsertMeta('name', 'twitter:card', 'summary_large_image')
  upsertMeta('name', 'twitter:title', title)
  upsertMeta('name', 'twitter:description', safeDescription)
  upsertMeta('name', 'twitter:image', image)

  setJsonLd(jsonLd)
}

export function buildTopicStructuredData(topic) {
  if (!topic?.id) return null
  const siteUrl = getPublicSiteUrl()
  const canonicalUrl = new URL(buildTopicPath(topic), siteUrl + '/').href
  const authorName =
    topic.user ||
    topic.profile?.display_name ||
    topic.profile?.username ||
    'Membro CreativeZone'
  const authorUsername = topic.authorUsername || topic.profile?.username || ''
  const author = {
    '@type': 'Person',
    name: authorName,
  }
  if (authorUsername) {
    author.url = new URL('/membro/' + encodeURIComponent(authorUsername), siteUrl + '/').href
  }

  const posting = {
    '@type': 'DiscussionForumPosting',
    url: canonicalUrl,
    headline: topic.title,
    text: plainText(topic.description || topic.content || ''),
    author,
    datePublished: topic.createdAt || topic.created_at,
    commentCount: Number(topic.replies || topic.reply_count || 0),
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/ViewAction',
        userInteractionCount: Number(topic.views || 0),
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: Number(topic.replies || topic.reply_count || 0),
      },
    ],
  }

  const modified = topic.updatedAt || topic.updated_at
  if (modified && modified !== posting.datePublished) posting.dateModified = modified
  if (topic.categorySlug) {
    posting.isPartOf = {
      '@type': 'CollectionPage',
      name: topic.category || 'Fórum',
      url: new URL('/forum/' + encodeURIComponent(topic.categorySlug), siteUrl + '/').href,
    }
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: canonicalUrl,
    name: topic.title,
    mainEntity: posting,
  }
}

export function buildCategoryStructuredData(category) {
  if (!category?.slug) return null
  const siteUrl = getPublicSiteUrl()
  const url = new URL('/forum/' + encodeURIComponent(category.slug), siteUrl + '/').href
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: category.name,
    description: plainText(category.description || ''),
    url,
    isPartOf: {
      '@type': 'WebSite',
      name: 'CreativeZone',
      url: siteUrl + '/',
    },
  }
}

export const seoDefaults = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  image: DEFAULT_IMAGE,
}
