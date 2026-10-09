import { supabase } from './supabaseClient'

const memoryCache = new Map()
const inflight = new Map()

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'yclid',
  '_hsenc',
  '_hsmi',
])

export function normalizePreviewUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(url.protocol)) return ''

    url.username = ''
    url.password = ''
    url.hash = ''

    for (const name of [...url.searchParams.keys()]) {
      const lower = name.toLowerCase()
      if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
        url.searchParams.delete(name)
      }
    }

    const sorted = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) =>
      ak.localeCompare(bk) || av.localeCompare(bv)
    )
    url.search = ''
    sorted.forEach(([key, item]) => url.searchParams.append(key, item))

    return url.href
  } catch {
    return ''
  }
}

export async function resolveLinkPreview(value) {
  const normalized = normalizePreviewUrl(value)
  if (!normalized || !supabase) return null

  if (memoryCache.has(normalized)) return memoryCache.get(normalized)
  if (inflight.has(normalized)) return inflight.get(normalized)

  const pending = supabase.functions
    .invoke('link-preview', {
      body: { url: normalized },
    })
    .then(({ data, error }) => {
      if (error) throw error
      const preview = data?.preview || null
      memoryCache.set(normalized, preview)
      return preview
    })
    .catch(() => {
      memoryCache.set(normalized, null)
      return null
    })
    .finally(() => {
      inflight.delete(normalized)
    })

  inflight.set(normalized, pending)
  return pending
}

export function clearLinkPreviewMemoryCache() {
  memoryCache.clear()
}
