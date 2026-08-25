import { describe, expect, it } from 'vitest'
import { groupLinkLabel } from './groupLink'

describe('groupLinkLabel', () => {
  it.each([
    ['https://chat.whatsapp.com/AbC123', 'WhatsApp'],
    ['https://wa.me/5491100000000', 'WhatsApp'],
    ['https://discord.gg/abc123', 'Discord'],
    ['https://discord.com/invite/abc123', 'Discord'],
    ['https://t.me/+AbC123', 'Telegram'],
    ['https://telegram.me/joinchat/AbC123', 'Telegram']
  ])('labels %s as %s', (url, label) => {
    expect(groupLinkLabel(url)).toBe(label)
  })

  it('matches the host case-insensitively', () => {
    expect(groupLinkLabel('https://Chat.WhatsApp.com/AbC123')).toBe('WhatsApp')
  })

  it('ignores a www. prefix on a known host', () => {
    expect(groupLinkLabel('https://www.discord.com/invite/abc123')).toBe('Discord')
  })

  it('returns null for any other host — the render site translates the generic label', () => {
    expect(groupLinkLabel('https://groups.google.com/g/algoritmos')).toBeNull()
  })

  it('returns null for a malformed URL instead of throwing', () => {
    expect(groupLinkLabel('not a url')).toBeNull()
  })

  it('never matches a known host embedded as a subdomain of another domain', () => {
    expect(groupLinkLabel('https://discord.gg.evil.example/abc')).toBeNull()
  })
})
