import { supabase } from './supabaseClient'

const memoryCache = new Map()
const inflight = new Map()

export function normalizeShieldUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:','https:'].includes(url.protocol)) return ''
    url.username = ''
    url.password = ''
    url.hash = ''
    if ((url.protocol === 'http:' && url.port === '80') ||
        (url.protocol === 'https:' && url.port === '443')) url.port = ''
    return url.href
  } catch {
    return ''
  }
}

export function shouldBypassLinkShield(value) {
  const normalized = normalizeShieldUrl(value)
  if (!normalized) return true
  const url = new URL(normalized)
  if (typeof window !== 'undefined' && url.origin === window.location.origin) return true
  if (url.hostname.endsWith('.supabase.co') && /\/storage\/v1\/object\/(?:sign|authenticated)\//.test(url.pathname)) return true
  return false
}

export function getCachedLinkSafety(value) {
  const normalized = normalizeShieldUrl(value)
  return normalized ? (memoryCache.get(normalized) || null) : null
}

export async function checkLinkSafety(value, { context = 'client', force = false } = {}) {
  const normalized = normalizeShieldUrl(value)
  if (!normalized || !supabase) return null
  if (shouldBypassLinkShield(normalized)) {
    return { normalized_url:normalized, verdict:'no_known_threat', decision:'allow', risk_score:0, protected:true, local:true }
  }
  if (!force && memoryCache.has(normalized)) return memoryCache.get(normalized)
  if (!force && inflight.has(normalized)) return inflight.get(normalized)

  const pending = supabase.functions.invoke('link-shield', {
    body: { action:'check', url:normalized, context, force },
  }).then(({data,error}) => {
    if (error) throw error
    const safety = data?.safety || null
    if (safety) memoryCache.set(normalized,safety)
    return safety
  }).catch(() => {
    const fallback = { normalized_url:normalized, verdict:'unknown', decision:'allow', risk_score:0, protected:false }
    memoryCache.set(normalized,fallback)
    return fallback
  }).finally(() => inflight.delete(normalized))

  inflight.set(normalized,pending)
  return pending
}

export async function reportSuspiciousLink(value) {
  const normalized=normalizeShieldUrl(value)
  if(!normalized||!supabase) throw new Error('Link inválido.')
  const {data,error}=await supabase.functions.invoke('link-shield',{
    body:{action:'report',url:normalized,reason:'suspected_malicious'},
  })
  if(error) throw error
  return data
}

export function clearLinkShieldMemoryCache() {
  memoryCache.clear()
}
