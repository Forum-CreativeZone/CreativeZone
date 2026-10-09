import { describe, expect, it } from 'vitest'
import { decodeSecurityEmbed, encodeSecurityEmbed } from './securityApi'

describe('CreativeZone Security embeds', () => {
  it('encodes and decodes package checks safely', () => {
    const encoded = encodeSecurityEmbed({
      ecosystem: 'npm',
      packageName: '@scope/package',
      version: '1.2.3',
    })
    expect(encoded).toBe('[security:npm:%40scope%2Fpackage:1.2.3]')
    expect(decodeSecurityEmbed(encoded)).toEqual({
      ecosystem: 'npm',
      packageName: '@scope/package',
      version: '1.2.3',
    })
  })

  it('supports ecosystems and package names with punctuation', () => {
    const encoded = encodeSecurityEmbed({
      ecosystem: 'GitHub Actions',
      packageName: 'actions/checkout',
      version: 'v4',
    })
    expect(decodeSecurityEmbed(encoded)).toEqual({
      ecosystem: 'GitHub Actions',
      packageName: 'actions/checkout',
      version: 'v4',
    })
  })

  it('rejects unrelated text', () => {
    expect(decodeSecurityEmbed('security npm react')).toBeNull()
  })
})
