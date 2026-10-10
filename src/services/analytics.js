const DEFAULT_MEASUREMENT_ID = 'G-1Q5LV312X2'

function getMeasurementId() {
  return String(import.meta.env.VITE_GA_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID).trim()
}

let initialized = false
let lastPageViewKey = ''

function ensureAnalytics() {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return
  const measurementId = getMeasurementId()
  if (!measurementId) return

  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments)
  }

  window.gtag('js', new Date())
  window.gtag('config', measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })

  if (!document.querySelector(`script[data-creativezone-ga="${measurementId}"]`)) {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
    script.dataset.creativezoneGa = measurementId
    document.head.appendChild(script)
  }

  initialized = true
}

export function trackPageView() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  ensureAnalytics()
  if (!window.gtag) return

  const pageLocation = window.location.href
  const pagePath = window.location.pathname + window.location.search
  const pageTitle = document.title
  const key = pageLocation + '|' + pageTitle

  if (key === lastPageViewKey) return
  lastPageViewKey = key

  window.gtag('event', 'page_view', {
    page_title: pageTitle,
    page_location: pageLocation,
    page_path: pagePath,
  })
}


export function trackEvent(eventName, params = {}) {
  if (typeof window === 'undefined') return

  ensureAnalytics()
  if (!window.gtag) return

  const name = String(eventName || '').trim()
  if (!/^[a-z][a-z0-9_]{0,39}$/i.test(name)) return

  const safeParams = Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) =>
        value === null ||
        typeof value === 'boolean' ||
        typeof value === 'number' ||
        typeof value === 'string'
      )
      .map(([key, value]) => [
        String(key).slice(0, 40),
        typeof value === 'string' ? value.slice(0, 100) : value,
      ])
  )

  window.gtag('event', name, safeParams)
}
