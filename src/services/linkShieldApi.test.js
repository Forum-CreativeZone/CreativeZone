import { describe, expect, it } from 'vitest'
import { normalizeShieldUrl } from './linkShieldApi'

describe('CreativeZone Link Shield URL normalization', () => {
  it('keeps query ordering and removes fragments', () => {
    expect(normalizeShieldUrl('https://example.com/a?b=2&a=1#fragment'))
      .toBe('https://example.com/a?b=2&a=1')
  })

  it('removes credentials and default ports', () => {
    expect(normalizeShieldUrl('https://user:pass@example.com:443/path'))
      .toBe('https://example.com/path')
  })

  it('rejects non-http protocols', () => {
    expect(normalizeShieldUrl('javascript:alert(1)')).toBe('')
    expect(normalizeShieldUrl('mailto:test@example.com')).toBe('')
  })
})
