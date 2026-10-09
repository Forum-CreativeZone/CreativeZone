import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_SITE_URL = 'https://assets-forum.gestao-quiroz.workers.dev'
const siteUrl = String(
  process.env.VITE_PUBLIC_SITE_URL ||
  process.env.PUBLIC_SITE_URL ||
  DEFAULT_SITE_URL
).trim().replace(/\/+$/, '')

const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const supabaseKey = String(
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim()

const distDir = path.resolve('dist')
const templatePath = path.join(distDir, 'index.html')
const defaultImage = 'https://raw.githubusercontent.com/Inosuke-Company/CreativeZone/main/assets/banner.png'

function plainText(value = '') {
  return String(value)
    .replace(/\[attachment:[^\]]+\]/gi, ' ')
    .replace(/\[\/?(?:quote|code|spoiler|url|img|b|i|u|s)(?:=[^\]]+)?\]/gi, ' ')
    .replace(/[#*_~>]+/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(value = '', max = 165) {
  const text = plainText(value)
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1).replace(/\s+\S*$/, '').trim()
  return (cut || text.slice(0, max - 1)).trim() + '…'
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeXml(value = '') {
  return escapeHtml(value).replace(/'/g, '&apos;')
}

function topicPath(topic) {
  const slug = String(topic.slug || 'topico').trim()
  return '/topico/' + encodeURIComponent(slug + '--' + topic.id)
}

function setTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
}

function setMeta(html, attribute, key, content) {
  const escaped = escapeHtml(content)
  const pattern = new RegExp(`<meta\\s+[^>]*${attribute}=["']${key}["'][^>]*>`, 'i')
  const tag = `<meta ${attribute}="${key}" content="${escaped}"/>`
  if (pattern.test(html)) return html.replace(pattern, tag)
  return html.replace('</head>', `  ${tag}\n</head>`)
}

function setCanonical(html, url) {
  const tag = `<link rel="canonical" href="${escapeHtml(url)}"/>`
  if (/<link\s+[^>]*rel=["']canonical["'][^>]*>/i.test(html)) {
    return html.replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i, tag)
  }
  return html.replace('</head>', `  ${tag}\n</head>`)
}

function addJsonLd(html, data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return html.replace('</head>', `  <script type="application/ld+json">${json}</script>\n</head>`)
}

function buildSeoHtml(template, { title, description, canonicalUrl, type = 'website', jsonLd }) {
  let html = template
  html = setTitle(html, title)
  html = setMeta(html, 'name', 'description', description)
  html = setMeta(html, 'name', 'robots', 'index,follow,max-image-preview:large')
  html = setCanonical(html, canonicalUrl)
  html = setMeta(html, 'property', 'og:type', type)
  html = setMeta(html, 'property', 'og:site_name', 'CreativeZone')
  html = setMeta(html, 'property', 'og:locale', 'pt_BR')
  html = setMeta(html, 'property', 'og:title', title)
  html = setMeta(html, 'property', 'og:description', description)
  html = setMeta(html, 'property', 'og:url', canonicalUrl)
  html = setMeta(html, 'property', 'og:image', defaultImage)
  html = setMeta(html, 'name', 'twitter:card', 'summary_large_image')
  html = setMeta(html, 'name', 'twitter:title', title)
  html = setMeta(html, 'name', 'twitter:description', description)
  html = setMeta(html, 'name', 'twitter:image', defaultImage)
  if (jsonLd) html = addJsonLd(html, jsonLd)
  return html
}

async function fetchRest(table, select, extra = '') {
  if (!supabaseUrl || !supabaseKey) return []
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`)
  url.searchParams.set('select', select)
  if (extra) {
    const params = new URLSearchParams(extra)
    for (const [key, value] of params) url.searchParams.append(key, value)
  }

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`${table}: HTTP ${response.status} ${await response.text()}`)
  }
  return response.json()
}

async function writeRouteHtml(routePath, html) {
  const directory = path.join(distDir, routePath.replace(/^\//, ''))
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'index.html'), html, 'utf8')
}

function buildTopicJsonLd(topic, profile, category) {
  const canonicalUrl = siteUrl + topicPath(topic)
  const authorName = profile?.display_name || profile?.username || 'Membro CreativeZone'
  const author = {
    '@type': 'Person',
    name: authorName,
  }
  if (profile?.username) {
    author.url = siteUrl + '/membro/' + encodeURIComponent(profile.username)
  }

  const posting = {
    '@type': 'DiscussionForumPosting',
    url: canonicalUrl,
    headline: topic.title,
    text: plainText(topic.content),
    author,
    datePublished: topic.created_at,
    commentCount: Number(topic.reply_count || 0),
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/ViewAction',
        userInteractionCount: Number(topic.views || 0),
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: Number(topic.reply_count || 0),
      },
    ],
  }

  if (topic.updated_at && topic.updated_at !== topic.created_at) {
    posting.dateModified = topic.updated_at
  }
  if (category?.slug) {
    posting.isPartOf = {
      '@type': 'CollectionPage',
      name: category.name,
      url: siteUrl + '/forum/' + encodeURIComponent(category.slug),
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

async function main() {
  const template = await readFile(templatePath, 'utf8')
  let topics = []
  let categories = []
  let profiles = []

  if (supabaseUrl && supabaseKey) {
    try {
      ;[topics, categories, profiles] = await Promise.all([
        fetchRest(
          'topics',
          'id,category_id,author_id,title,slug,content,views,created_at,updated_at',
          'order=updated_at.desc'
        ),
        fetchRest(
          'categories',
          'id,name,slug,description,node_type,sort_order',
          'order=sort_order.asc'
        ),
        fetchRest(
          'profiles',
          'id,username,display_name,profile_visibility,account_status',
          'profile_visibility=eq.public&account_status=eq.active'
        ),
      ])

      const topicIds = topics.map((topic) => topic.id)
      if (topicIds.length) {
        const counts = await fetchRest(
          'posts',
          'topic_id',
          'topic_id=in.(' + topicIds.join(',') + ')'
        )
        const byTopic = new Map()
        for (const row of counts) {
          byTopic.set(row.topic_id, (byTopic.get(row.topic_id) || 0) + 1)
        }
        topics = topics.map((topic) => ({
          ...topic,
          reply_count: byTopic.get(topic.id) || 0,
        }))
      }
    } catch (error) {
      console.warn('[seo] Não foi possível carregar conteúdo do Supabase:', error.message)
      topics = []
      categories = []
      profiles = []
    }
  } else {
    console.warn('[seo] Build sem credenciais públicas do Supabase; sitemap será gerado apenas com páginas estáticas.')
  }

  const categoriesById = new Map(categories.map((item) => [item.id, item]))
  const profilesById = new Map(profiles.map((item) => [item.id, item]))

  for (const topic of topics) {
    if (!topic?.id || !topic?.slug || !topic?.title) continue
    const route = topicPath(topic)
    const canonicalUrl = siteUrl + route
    const description = truncate(topic.content) || `Discussão no fórum CreativeZone: ${topic.title}`
    const html = buildSeoHtml(template, {
      title: topic.title + ' | CreativeZone',
      description,
      canonicalUrl,
      type: 'article',
      jsonLd: buildTopicJsonLd(
        topic,
        profilesById.get(topic.author_id),
        categoriesById.get(topic.category_id)
      ),
    })
    await writeRouteHtml(route, html)
  }

  for (const category of categories) {
    if (!category?.slug || !category?.name) continue
    const route = '/forum/' + encodeURIComponent(category.slug)
    const canonicalUrl = siteUrl + route
    const description = truncate(category.description) || `Discussões sobre ${category.name} na CreativeZone.`
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: category.name,
      description: plainText(category.description || ''),
      url: canonicalUrl,
      isPartOf: {
        '@type': 'WebSite',
        name: 'CreativeZone',
        url: siteUrl + '/',
      },
    }
    const html = buildSeoHtml(template, {
      title: category.name + ' | Fórum CreativeZone',
      description,
      canonicalUrl,
      jsonLd,
    })
    await writeRouteHtml(route, html)
  }

  const urls = [
    { loc: siteUrl + '/', changefreq: 'hourly', priority: '1.0' },
    { loc: siteUrl + '/creativezone', changefreq: 'weekly', priority: '0.8' },
    { loc: siteUrl + '/projetos', changefreq: 'daily', priority: '0.8' },
    { loc: siteUrl + '/categorias', changefreq: 'daily', priority: '0.8' },
    { loc: siteUrl + '/membros', changefreq: 'daily', priority: '0.6' },
    ...categories
      .filter((item) => item?.slug)
      .map((item) => ({
        loc: siteUrl + '/forum/' + encodeURIComponent(item.slug),
        changefreq: 'daily',
        priority: item.node_type === 'forum' ? '0.8' : '0.7',
      })),
    ...topics
      .filter((item) => item?.id && item?.slug)
      .map((item) => ({
        loc: siteUrl + topicPath(item),
        lastmod: item.updated_at || item.created_at,
        changefreq: 'weekly',
        priority: '0.9',
      })),
  ]

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((item) => {
      const parts = [
        '<url>',
        `<loc>${escapeXml(item.loc)}</loc>`,
        item.lastmod ? `<lastmod>${escapeXml(new Date(item.lastmod).toISOString())}</lastmod>` : '',
        item.changefreq ? `<changefreq>${item.changefreq}</changefreq>` : '',
        item.priority ? `<priority>${item.priority}</priority>` : '',
        '</url>',
      ].filter(Boolean)
      return '  ' + parts.join('')
    }),
    '</urlset>',
    '',
  ].join('\n')

  await writeFile(path.join(distDir, 'sitemap.xml'), sitemap, 'utf8')
  await writeFile(
    path.join(distDir, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
    'utf8'
  )

  console.log(`[seo] Gerados ${topics.length} tópico(s), ${categories.length} categoria(s) e sitemap para ${siteUrl}.`)
}

main().catch((error) => {
  console.error('[seo] Falha ao gerar assets SEO:', error)
  process.exitCode = 1
})
