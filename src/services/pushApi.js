import { supabase } from './supabaseClient'
import { getCurrentDeviceId, logAccountEvent } from './communityApi'

const VAPID_PUBLIC_KEY =
  'BAtmaLgtvqyI5b_KIcAij0-U2K6CQ9YmajktFYLM3Jm2JrBZLulntzIxWsTfZzzAkZzqPF6VhWFb5Y1-CzCdKzo'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export function canUseWebPush() {
  return Boolean(
    typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
  )
}

export async function getPushPermissionState() {
  if (!canUseWebPush()) return 'unsupported'
  return Notification.permission
}

export async function enableWebPush(userId) {
  if (!canUseWebPush()) {
    throw new Error('Este navegador não oferece suporte a notificações push.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'As notificações foram bloqueadas no navegador. Libere a permissão nas configurações do site.'
        : 'A permissão para notificações não foi concedida.'
    )
  }

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = subscription.toJSON()
  const payload = {
    user_id: userId,
    device_id: getCurrentDeviceId(),
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent || '',
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(payload, { onConflict: 'endpoint' })
  if (error) throw error

  await supabase
    .from('account_settings')
    .update({ push_enabled: true })
    .eq('user_id', userId)

  await logAccountEvent('push_enabled').catch(() => {})
  return subscription
}

export async function disableWebPush(userId) {
  if (!canUseWebPush()) return

  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()

  if (subscription) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', subscription.endpoint)
    await subscription.unsubscribe().catch(() => {})
  }

  await supabase
    .from('account_settings')
    .update({ push_enabled: false })
    .eq('user_id', userId)

  await logAccountEvent('push_disabled').catch(() => {})
}

export async function isPushEnabledForCurrentDevice(userId) {
  if (!canUseWebPush() || Notification.permission !== 'granted') return false
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return false

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('endpoint', subscription.endpoint)
    .maybeSingle()

  if (error) return false
  return Boolean(data)
}
