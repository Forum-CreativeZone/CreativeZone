import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_KEY = (() => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (legacy) return legacy

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS")
  if (raw) {
    try {
      const keys = JSON.parse(raw)
      if (keys?.default) return String(keys.default)
    } catch {
      // No usable server key was found.
    }
  }
  return ""
})()

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
}

const MAX_URL_LENGTH = 4096
const MAX_HTML_BYTES = 1_500_000
const FETCH_TIMEOUT_MS = 9_000
const MAX_REDIRECTS = 4
const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MINIMAL_TTL_MS = 24 * 60 * 60 * 1000
const FAILURE_TTL_MS = 2 * 60 * 60 * 1000
const NETWORK_WINDOW_MS = 5 * 60 * 1000
const NETWORK_MISS_LIMIT = 30

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "yclid",
  "_hsenc",
  "_hsmi",
])

const rateBuckets = new Map<string, { count: number; resetAt: number }>()

type PreviewStatus = "ok" | "minimal" | "failed"

type PreviewRecord = {
  normalized_url: string
  request_url: string
  final_url: string
  domain: string
  title: string | null
  description: string | null
  image_url: string | null
  logo_url: string | null
  publisher: string | null
  author: string | null
  published_at: string | null
  lang: string | null
  status: PreviewStatus
  http_status: number | null
  content_type: string | null
  metadata: Record<string, unknown>
  failure_reason: string | null
  fetched_at: string
  expires_at: string
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
    },
  })
}

function compact(value: unknown, max: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  if (!text) return null
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    hellip: "…",
    laquo: "«",
    raquo: "»",
  }

  return value
    .replace(/&#(\d+);/g, (_, code) => {
      const point = Number(code)
      return Number.isFinite(point) ? String.fromCodePoint(point) : _
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const point = Number.parseInt(code, 16)
      return Number.isFinite(point) ? String.fromCodePoint(point) : _
    })
    .replace(/&([a-z]+);/gi, (entity, name) => named[String(name).toLowerCase()] ?? entity)
}

function cleanText(value: unknown, max: number) {
  const raw = String(value ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
  return compact(decodeHtmlEntities(raw), max)
}

function absoluteHttpUrl(value: unknown, base: URL) {
  if (!value) return null
  try {
    const next = new URL(String(value).trim(), base)
    if (!["http:", "https:"].includes(next.protocol)) return null
    next.username = ""
    next.password = ""
    next.hash = ""
    return next.href.slice(0, MAX_URL_LENGTH)
  } catch {
    return null
  }
}

function normalizeTargetUrl(value: unknown) {
  const input = String(value ?? "").trim()
  if (!input || input.length > MAX_URL_LENGTH) {
    throw new Error("invalid_url")
  }

  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error("invalid_url")
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("invalid_protocol")
  }

  url.username = ""
  url.password = ""
  url.hash = ""

  for (const name of [...url.searchParams.keys()]) {
    const lower = name.toLowerCase()
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
      url.searchParams.delete(name)
    }
  }

  const sorted = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) =>
    ak.localeCompare(bk) || av.localeCompare(bv)
  )
  url.search = ""
  for (const [key, val] of sorted) url.searchParams.append(key, val)

  if ((url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")) {
    url.port = ""
  }

  return url
}

function parseIpv4(value: string) {
  const parts = value.split(".")
  if (parts.length !== 4) return null
  const nums = parts.map((part) => Number(part))
  if (nums.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return nums
}

function isPrivateOrReservedIp(value: string) {
  const ip = value.replace(/^\[|\]$/g, "").toLowerCase()

  if (ip.startsWith("::ffff:")) {
    return isPrivateOrReservedIp(ip.slice("::ffff:".length))
  }

  const v4 = parseIpv4(ip)
  if (v4) {
    const [a, b] = v4
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 0) return true
    if (a === 192 && b === 168) return true
    if (a === 198 && (b === 18 || b === 19)) return true
    if (a >= 224) return true
    return false
  }

  if (!ip.includes(":")) return false

  return ip === "::" ||
    ip === "::1" ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe8") ||
    ip.startsWith("fe9") ||
    ip.startsWith("fea") ||
    ip.startsWith("feb") ||
    ip.startsWith("2001:db8:")
}

async function resolveDns(hostname: string, type: "A" | "AAAA") {
  const denoWithDns = Deno as unknown as {
    resolveDns?: (query: string, recordType: "A" | "AAAA") => Promise<string[]>
  }

  if (typeof denoWithDns.resolveDns === "function") {
    try {
      return await denoWithDns.resolveDns(hostname, type)
    } catch {
      // Fall back to DNS-over-HTTPS below.
    }
  }

  const endpoint = new URL("https://cloudflare-dns.com/dns-query")
  endpoint.searchParams.set("name", hostname)
  endpoint.searchParams.set("type", type)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3500)
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/dns-json" },
      signal: controller.signal,
    })
    if (!response.ok) return []
    const body = await response.json().catch(() => null)
    const wantedType = type === "A" ? 1 : 28
    return Array.isArray(body?.Answer)
      ? body.Answer
          .filter((answer: { type?: number; data?: string }) =>
            answer?.type === wantedType && typeof answer?.data === "string"
          )
          .map((answer: { data: string }) => answer.data)
      : []
  } finally {
    clearTimeout(timeout)
  }
}

async function assertPublicUrl(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()

  if (!host ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")) {
    throw new Error("blocked_host")
  }

  if (parseIpv4(host) || host.includes(":")) {
    if (isPrivateOrReservedIp(host)) throw new Error("blocked_ip")
    return
  }

  const [aResult, aaaaResult] = await Promise.allSettled([
    resolveDns(host, "A"),
    resolveDns(host, "AAAA"),
  ])

  const records = [
    ...(aResult.status === "fulfilled" ? aResult.value : []),
    ...(aaaaResult.status === "fulfilled" ? aaaaResult.value : []),
  ]

  if (!records.length) throw new Error("dns_unavailable")
  if (records.some(isPrivateOrReservedIp)) throw new Error("blocked_dns_target")
}

function getClientKey(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

function consumeNetworkBudget(req: Request) {
  const key = getClientKey(req)
  const now = Date.now()
  const current = rateBuckets.get(key)

  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + NETWORK_WINDOW_MS })
    return true
  }

  if (current.count >= NETWORK_MISS_LIMIT) return false
  current.count += 1
  return true
}

function parseAttributes(tag: string) {
  const attrs: Record<string, string> = {}
  const regex = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g
  let match
  while ((match = regex.exec(tag)) !== null) {
    const key = match[1].toLowerCase()
    attrs[key] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "")
  }
  return attrs
}

function metadataMap(html: string) {
  const result = new Map<string, string>()
  const tags = html.match(/<meta\b[^>]*>/gi) || []

  for (const tag of tags) {
    const attrs = parseAttributes(tag)
    const key = String(attrs.property || attrs.name || attrs.itemprop || "").trim().toLowerCase()
    const value = attrs.content?.trim()
    if (key && value && !result.has(key)) result.set(key, value)
  }

  return result
}

function getLinks(html: string) {
  return (html.match(/<link\b[^>]*>/gi) || []).map(parseAttributes)
}

function getJsonLdNodes(html: string) {
  const nodes: Record<string, unknown>[] = []
  const regex = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match

  const walk = (value: unknown, depth = 0) => {
    if (depth > 5 || value == null) return
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1))
      return
    }
    if (typeof value !== "object") return
    const object = value as Record<string, unknown>
    nodes.push(object)
    for (const child of Object.values(object)) {
      if (child && (Array.isArray(child) || typeof child === "object")) {
        walk(child, depth + 1)
      }
    }
  }

  while ((match = regex.exec(html)) !== null) {
    const raw = match[1]
      .replace(/^\s*<!--/, "")
      .replace(/-->\s*$/, "")
      .trim()
    if (!raw || raw.length > 250_000) continue
    try {
      walk(JSON.parse(raw))
    } catch {
      // Invalid JSON-LD is ignored; other metadata sources still work.
    }
  }

  return nodes
}

function jsonLdString(nodes: Record<string, unknown>[], keys: string[]) {
  for (const node of nodes) {
    for (const key of keys) {
      const value = node[key]
      if (typeof value === "string" && value.trim()) return value.trim()
      if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === "string")
        if (typeof first === "string" && first.trim()) return first.trim()
      }
    }
  }
  return null
}

function jsonLdName(nodes: Record<string, unknown>[], key: string) {
  for (const node of nodes) {
    const value = node[key]
    const values = Array.isArray(value) ? value : [value]
    for (const entry of values) {
      if (typeof entry === "string" && entry.trim()) return entry.trim()
      if (entry && typeof entry === "object") {
        const object = entry as Record<string, unknown>
        if (typeof object.name === "string" && object.name.trim()) return object.name.trim()
      }
    }
  }
  return null
}

function jsonLdUrl(nodes: Record<string, unknown>[], key: string) {
  for (const node of nodes) {
    const value = node[key]
    const values = Array.isArray(value) ? value : [value]
    for (const entry of values) {
      if (typeof entry === "string" && entry.trim()) return entry.trim()
      if (entry && typeof entry === "object") {
        const object = entry as Record<string, unknown>
        for (const candidate of [object.url, object.contentUrl, object["@id"]]) {
          if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
        }
      }
    }
  }
  return null
}

function htmlTitle(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return match ? cleanText(match[1], 300) : null
}

function htmlLang(html: string) {
  const match = html.match(/<html\b[^>]*>/i)
  if (!match) return null
  const attrs = parseAttributes(match[0])
  return compact(attrs.lang, 24)
}

function findLink(links: Record<string, string>[], relNames: string[]) {
  for (const link of links) {
    const rel = String(link.rel || "").toLowerCase().split(/\s+/)
    if (relNames.some((name) => rel.includes(name)) && link.href) return link.href
  }
  return null
}

function parseDate(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function extractPreview(html: string, finalUrl: URL) {
  const meta = metadataMap(html)
  const links = getLinks(html)
  const jsonLd = getJsonLdNodes(html)
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta.get(key.toLowerCase())
      if (value?.trim()) return value.trim()
    }
    return null
  }

  const canonicalCandidate =
    findLink(links, ["canonical"]) ||
    pick("og:url") ||
    jsonLdString(jsonLd, ["url", "@id"])

  const canonicalUrl = canonicalCandidate
    ? absoluteHttpUrl(canonicalCandidate, finalUrl)
    : finalUrl.href

  const base = new URL(canonicalUrl || finalUrl.href)

  const imageCandidate =
    pick("og:image:secure_url", "og:image", "twitter:image", "twitter:image:src") ||
    jsonLdUrl(jsonLd, "image")

  const logoCandidate =
    pick("og:logo") ||
    jsonLdUrl(jsonLd, "logo") ||
    findLink(links, ["apple-touch-icon"]) ||
    findLink(links, ["icon", "shortcut"])

  const title = cleanText(
    pick("og:title", "twitter:title") ||
    jsonLdString(jsonLd, ["headline", "name"]) ||
    htmlTitle(html) ||
    base.hostname,
    300,
  )

  const description = cleanText(
    pick("og:description", "twitter:description", "description") ||
    jsonLdString(jsonLd, ["description"]),
    1000,
  )

  const publisher = cleanText(
    pick("og:site_name", "application-name") ||
    jsonLdName(jsonLd, "publisher") ||
    base.hostname.replace(/^www\./, ""),
    160,
  )

  const author = cleanText(
    pick("author", "article:author", "twitter:creator") ||
    jsonLdName(jsonLd, "author"),
    160,
  )

  const publishedAt = parseDate(
    pick("article:published_time", "date", "datepublished") ||
    jsonLdString(jsonLd, ["datePublished"]),
  )

  const lang = compact(
    pick("og:locale") ||
    jsonLdString(jsonLd, ["inLanguage"]) ||
    htmlLang(html),
    24,
  )

  const imageUrl = absoluteHttpUrl(imageCandidate, base)
  const logoUrl = absoluteHttpUrl(logoCandidate, base)

  return {
    canonicalUrl,
    title,
    description,
    imageUrl,
    logoUrl,
    publisher,
    author,
    publishedAt,
    lang,
    siteName: pick("og:site_name"),
  }
}

async function readHtml(response: Response) {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let html = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_HTML_BYTES) throw new Error("html_too_large")
      html += decoder.decode(value, { stream: true })
      if (html.length > 8_000 && /<\/head\s*>/i.test(html)) {
        await reader.cancel().catch(() => {})
        break
      }
    }
    html += decoder.decode()
    return html
  } finally {
    try { reader.releaseLock() } catch {}
  }
}

async function fetchHtml(target: URL) {
  let current = new URL(target.href)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicUrl(current)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "CreativeZone-LinkPreview/1.0 (+https://forum.creativezone.pro/)",
          "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
          "Cache-Control": "no-cache",
        },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (!location) throw new Error("redirect_without_location")
        try { await response.body?.cancel() } catch {}
        current = new URL(location, current)
        continue
      }

      const contentType = response.headers.get("content-type") || ""
      if (!response.ok) {
        const error = new Error("upstream_http_" + response.status)
        ;(error as Error & { httpStatus?: number; contentType?: string }).httpStatus = response.status
        ;(error as Error & { httpStatus?: number; contentType?: string }).contentType = contentType
        throw error
      }

      if (contentType &&
          !contentType.includes("text/html") &&
          !contentType.includes("application/xhtml+xml")) {
        const error = new Error("unsupported_content_type")
        ;(error as Error & { httpStatus?: number; contentType?: string }).httpStatus = response.status
        ;(error as Error & { httpStatus?: number; contentType?: string }).contentType = contentType
        throw error
      }

      return {
        response,
        html: await readHtml(response),
        finalUrl: current,
        contentType,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error("too_many_redirects")
}

async function validatePublicAssetUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!["http:", "https:"].includes(url.protocol)) return null
    await assertPublicUrl(url)
    return url.href.slice(0, MAX_URL_LENGTH)
  } catch {
    return null
  }
}

function publicPreview(record: Partial<PreviewRecord>) {
  return {
    normalized_url: record.normalized_url || "",
    url: record.final_url || record.normalized_url || "",
    domain: record.domain || "",
    title: record.title || null,
    description: record.description || null,
    image_url: record.image_url || null,
    logo_url: record.logo_url || null,
    publisher: record.publisher || null,
    author: record.author || null,
    published_at: record.published_at || null,
    lang: record.lang || null,
    status: record.status || "minimal",
    fetched_at: record.fetched_at || null,
    expires_at: record.expires_at || null,
  }
}

async function readCache(normalizedUrl: string) {
  const { data, error } = await admin
    .from("link_preview_cache")
    .select("*")
    .eq("normalized_url", normalizedUrl)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (error) throw error
  return data as PreviewRecord | null
}

async function writeCache(record: PreviewRecord) {
  const { error } = await admin
    .from("link_preview_cache")
    .upsert(record, { onConflict: "normalized_url" })
  if (error) throw error
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405)
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "preview_service_unavailable" }, 503)
  }

  let body: { url?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: "invalid_json" }, 400)
  }

  let target: URL
  try {
    target = normalizeTargetUrl(body?.url)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "invalid_url" }, 400)
  }

  const normalizedUrl = target.href

  try {
    const cached = await readCache(normalizedUrl)
    if (cached) {
      return json({
        ok: cached.status !== "failed",
        cached: true,
        preview: publicPreview(cached),
      })
    }
  } catch (error) {
    console.error("link-preview cache read:", error)
  }

  if (!consumeNetworkBudget(req)) {
    return json({
      error: "network_preview_rate_limited",
      retry_after_seconds: Math.ceil(NETWORK_WINDOW_MS / 1000),
    }, 429)
  }

  const fetchedAt = new Date()
  try {
    const { response, html, finalUrl, contentType } = await fetchHtml(target)
    const metadata = extractPreview(html, finalUrl)
    let final = new URL(finalUrl.href)
    if (metadata.canonicalUrl) {
      try {
        const canonical = new URL(metadata.canonicalUrl)
        await assertPublicUrl(canonical)
        final = canonical
      } catch {
        // A hostile/invalid canonical must not invalidate metadata fetched from a safe URL.
      }
    }

    const [safeImageUrl, safeLogoUrl] = await Promise.all([
      validatePublicAssetUrl(metadata.imageUrl),
      validatePublicAssetUrl(metadata.logoUrl),
    ])

    const useful = Boolean(
      metadata.title ||
      metadata.description ||
      safeImageUrl ||
      safeLogoUrl
    )
    const status: PreviewStatus = useful ? "ok" : "minimal"
    const expiresAt = new Date(
      fetchedAt.getTime() + (status === "ok" ? SUCCESS_TTL_MS : MINIMAL_TTL_MS)
    )

    const record: PreviewRecord = {
      normalized_url: normalizedUrl,
      request_url: String(body.url).slice(0, MAX_URL_LENGTH),
      final_url: final.href.slice(0, MAX_URL_LENGTH),
      domain: final.hostname.replace(/^www\./, "").slice(0, 255),
      title: metadata.title,
      description: metadata.description,
      image_url: safeImageUrl,
      logo_url: safeLogoUrl,
      publisher: metadata.publisher,
      author: metadata.author,
      published_at: metadata.publishedAt,
      lang: metadata.lang,
      status,
      http_status: response.status,
      content_type: compact(contentType, 255),
      metadata: {
        engine: "creativezone-link-preview-html-v1",
        canonical_url: metadata.canonicalUrl,
        site_name: metadata.siteName,
      },
      failure_reason: null,
      fetched_at: fetchedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    }

    await writeCache(record).catch((error) => {
      console.error("link-preview cache write:", error)
    })

    return json({
      ok: true,
      cached: false,
      preview: publicPreview(record),
    })
  } catch (error) {
    const typed = error as Error & { httpStatus?: number; contentType?: string }
    const reason = compact(typed?.message || "preview_failed", 300) || "preview_failed"
    const expiresAt = new Date(fetchedAt.getTime() + FAILURE_TTL_MS)

    const failed: PreviewRecord = {
      normalized_url: normalizedUrl,
      request_url: String(body.url).slice(0, MAX_URL_LENGTH),
      final_url: normalizedUrl,
      domain: target.hostname.replace(/^www\./, "").slice(0, 255),
      title: null,
      description: null,
      image_url: null,
      logo_url: null,
      publisher: null,
      author: null,
      published_at: null,
      lang: null,
      status: "failed",
      http_status: typed.httpStatus || null,
      content_type: compact(typed.contentType, 255),
      metadata: { engine: "creativezone-link-preview-html-v1" },
      failure_reason: reason,
      fetched_at: fetchedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    }

    await writeCache(failed).catch((cacheError) => {
      console.error("link-preview failed cache write:", cacheError)
    })

    return json({
      ok: false,
      cached: false,
      preview: publicPreview(failed),
    })
  }
})
