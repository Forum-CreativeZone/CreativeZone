self.addEventListener('push', (event) => {
  let payload = {
    title: 'CreativeZone',
    body: 'Você recebeu uma nova notificação.',
    url: '/',
    tag: 'creativezone-notification',
  }

  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url || '/' },
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return clients.openWindow(target)
    })
  )
})
