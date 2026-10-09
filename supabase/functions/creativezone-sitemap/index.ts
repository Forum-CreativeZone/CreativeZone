/* Public XML sitemap for CreativeZone.
 * Uses only the public Supabase key and public-read RLS policies.
 */

const DEFAULT_SITE_URL = 'https://forum.creativezone.pro'

function getSiteUrl() {
  return String(Deno.env.get('PUBLIC_SITE_URL') || DEFAULT_SITE_URL)
    .trim()
    .replace(/\/+$/, '')
}

function getPublishableKey() {
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (raw) {
    try {
      const keys = JSON.parse(raw)
      if (keys?.default) return String(keys.default)
    } catch {
      // Fall back to the legacy public key when needed.
    }
  }
  return Deno.env.get('SUPABASE_ANON_KEY') || ''
}

function escapeXml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function topicPath(topic: { id: string; slug?: string | null }) {
  const slug = String(topic.slug || 'topico').trim()
  return '/topico/' + encodeURIComponent(slug + '--' + topic.id)
}

async function fetchAll(
  supabaseUrl: string,
  apiKey: string,
  table: string,
  select: string,
  order?: string,
) {
  const pageSize = 1000
  const rows: Record<string, unknown>[] = []
  let offset = 0

  while (true) {
    const url = new URL(supabaseUrl + '/rest/v1/' + table)
    url.searchParams.set('select', select)
    url.searchParams.set('limit', String(pageSize))
    url.searchParams.set('offset', String(offset))
    if (order) url.searchParams.set('order', order)

    const response = await fetch(url, {
      headers: {
        apikey: apiKey,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(table + ': HTTP ' + response.status)
    }

    const page = await response.json()
    rows.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }

  return rows
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const apiKey = getPublishableKey()
  if (!supabaseUrl || !apiKey) {
    return new Response('Sitemap unavailable', { status: 503 })
  }

  try {
    const siteUrl = getSiteUrl()
    const [topics, categories] = await Promise.all([
      fetchAll(
        supabaseUrl,
        apiKey,
        'topics',
        'id,title,slug,created_at,updated_at',
        'updated_at.desc',
      ),
      fetchAll(
        supabaseUrl,
        apiKey,
        'categories',
        'id,name,slug,node_type,sort_order',
        'sort_order.asc',
      ),
    ])

    const entries = [
      { loc: siteUrl + '/', changefreq: 'hourly', priority: '1.0' },
      { loc: siteUrl + '/creativezone', changefreq: 'weekly', priority: '0.8' },
      { loc: siteUrl + '/projetos', changefreq: 'daily', priority: '0.8' },
      { loc: siteUrl + '/categorias', changefreq: 'daily', priority: '0.8' },
      { loc: siteUrl + '/membros', changefreq: 'daily', priority: '0.6' },
      ...categories
        .filter((item) => item.slug)
        .map((item) => ({
          loc: siteUrl + '/forum/' + encodeURIComponent(String(item.slug)),
          changefreq: 'daily',
          priority: item.node_type === 'forum' ? '0.8' : '0.7',
        })),
      ...topics
        .filter((item) => item.id && item.slug)
        .map((item) => ({
          loc: siteUrl + topicPath({
            id: String(item.id),
            slug: String(item.slug),
          }),
          lastmod: item.updated_at || item.created_at,
          changefreq: 'weekly',
          priority: '0.9',
        })),
    ]

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries.map((entry) => {
        const parts = [
          '<url>',
          '<loc>' + escapeXml(entry.loc) + '</loc>',
          entry.lastmod
            ? '<lastmod>' + escapeXml(new Date(String(entry.lastmod)).toISOString()) + '</lastmod>'
            : '',
          entry.changefreq ? '<changefreq>' + entry.changefreq + '</changefreq>' : '',
          entry.priority ? '<priority>' + entry.priority + '</priority>' : '',
          '</url>',
        ].filter(Boolean)
        return '  ' + parts.join('')
      }),
      '</urlset>',
      '',
    ].join('\n')

    const headers = {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options': 'nosniff',
    }

    return new Response(req.method === 'HEAD' ? null : xml, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error('creativezone-sitemap:', error)
    return new Response('Sitemap unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
})
