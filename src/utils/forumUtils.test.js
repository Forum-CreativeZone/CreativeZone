import { describe, expect, it } from 'vitest'
import {
  getPageCount,
  isAllowedForumAttachment,
  MAX_FORUM_ATTACHMENT_BYTES,
  slugify,
} from './forumUtils'

describe('slugify', () => {
  it('normalizes accents and spaces for topic URLs', () => {
    expect(slugify('Olá, Creative Zone!')).toBe('ola-creative-zone')
  })

  it('trims separators', () => {
    expect(slugify('--- Projeto IA ---')).toBe('projeto-ia')
  })
})

describe('getPageCount', () => {
  it('keeps at least one page', () => {
    expect(getPageCount(0, 3)).toBe(1)
  })

  it('rounds up server-side result pages', () => {
    expect(getPageCount(7, 3)).toBe(3)
  })
})

describe('isAllowedForumAttachment', () => {
  it('accepts supported files within 10 MB', () => {
    expect(isAllowedForumAttachment({ type: 'image/png', size: 1024 })).toBe(true)
  })

  it('rejects unsupported and oversized files', () => {
    expect(isAllowedForumAttachment({ type: 'application/zip', size: 1024 })).toBe(false)
    expect(isAllowedForumAttachment({ type: 'image/png', size: MAX_FORUM_ATTACHMENT_BYTES + 1 })).toBe(false)
  })
})
