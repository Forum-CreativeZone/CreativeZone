import { describe, expect, it } from 'vitest'
import { normalizePreviewUrl } from './linkPreviewApi'

describe('CreativeZone Link Preview URL normalization', () => {
  it('removes fragments and common tracking parameters', () => {
    expect(
      normalizePreviewUrl('https://example.com/post?utm_source=x&b=2&a=1&fbclid=abc#section')
    ).toBe('https://example.com/post?a=1&b=2')
  })

  it('keeps meaningful query parameters', () => {
    expect(
      normalizePreviewUrl('https://example.com/search?q=react&page=2')
    ).toBe('https://example.com/search?page=2&q=react')
  })

  it('rejects non-http protocols', () => {
    expect(normalizePreviewUrl('javascript:alert(1)')).toBe('')
    expect(normalizePreviewUrl('data:text/plain,hello')).toBe('')
  })
})
