const OFFICIAL_HOST = 'forum.creativezone.pro'
const INDEXNOW_KEY = 'cz-20261010-7f4b9c2e6a1d8f305c92b4e7a613d8f4'
const INDEXNOW_PATH = '/' + INDEXNOW_KEY + '.txt'
const INDEXNOW_HOSTS = new Set(['creativezone.pro', 'www.creativezone.pro', OFFICIAL_HOST])

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (INDEXNOW_HOSTS.has(url.hostname) && url.pathname === INDEXNOW_PATH) {
      return new Response(INDEXNOW_KEY, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        },
      })
    }

    if (url.hostname.endsWith('.workers.dev')) {
      url.protocol = 'https:'
      url.hostname = OFFICIAL_HOST
      url.port = ''
      return Response.redirect(url.toString(), 308)
    }

    return env.ASSETS.fetch(request)
  },
}
