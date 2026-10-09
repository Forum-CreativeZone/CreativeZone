const OFFICIAL_HOST = 'forum.creativezone.pro'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.hostname.endsWith('.workers.dev')) {
      url.protocol = 'https:'
      url.hostname = OFFICIAL_HOST
      url.port = ''
      return Response.redirect(url.toString(), 308)
    }

    return env.ASSETS.fetch(request)
  },
}
