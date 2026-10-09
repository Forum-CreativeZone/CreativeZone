import React from 'react'

const FORUM_ICON_MAP = {
  headphones: 'tabler:headphones',
  pin: 'tabler:pin',
  rocket: 'tabler:rocket',
  tools: 'tabler:tools',
  laptop: 'tabler:device-laptop',
  star: 'tabler:star',
  package: 'tabler:package',
  download: 'tabler:download',
  lock: 'tabler:lock',
  palette: 'tabler:palette',
  check: 'tabler:check',
  architect: 'tabler:building-community',
  shield: 'tabler:shield-check',
  user: 'tabler:user',
  message: 'tabler:message-circle',
  image: 'tabler:photo',
  upload: 'tabler:upload',
  link: 'tabler:link',
}

export function ForumIcon({ name, icon, className = '', title = '' }) {
  const value = icon || FORUM_ICON_MAP[name] || name
  if (!value) return null

  return React.createElement('iconify-icon', {
    icon: value,
    class: className || undefined,
    title: title || undefined,
    'aria-hidden': title ? undefined : 'true',
  })
}

export const forumIconMap = FORUM_ICON_MAP
