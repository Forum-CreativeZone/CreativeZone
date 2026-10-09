import { describe, expect, it } from 'vitest'
import {
  buildTopicPath,
  parseTopicRouteId,
  plainText,
  truncateText,
} from './seo'

describe('SEO topic routes', () => {
  it('builds a readable topic URL while keeping the UUID for stable lookup', () => {
    expect(buildTopicPath({
      id: '8d78d950-04b8-409b-a59a-25cc89099203',
      slug: 'adobe-audition-2024-v24-0-3-3',
      title: 'Adobe Audition 2024',
    })).toBe('/topico/adobe-audition-2024-v24-0-3-3--8d78d950-04b8-409b-a59a-25cc89099203')
  })

  it('accepts both legacy UUID routes and new readable routes', () => {
    const id = '8d78d950-04b8-409b-a59a-25cc89099203'
    expect(parseTopicRouteId(id)).toBe(id)
    expect(parseTopicRouteId('meu-topico--' + id)).toBe(id)
  })

  it('turns forum markup into useful plain text descriptions', () => {
    expect(plainText('## Título **forte** [quote=@membro]texto[/quote]')).toBe('Título forte texto')
  })

  it('keeps meta descriptions at a search-friendly size', () => {
    expect(truncateText('a '.repeat(200), 80).length).toBeLessThanOrEqual(80)
  })
})
