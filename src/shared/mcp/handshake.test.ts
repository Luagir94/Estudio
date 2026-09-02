import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encodeAck, encodeHello, MAX_PREAMBLE_BYTES, parseAck, parseHello } from './handshake'

describe('encodeHello / parseHello', () => {
  it('round-trips a token into { present: true, hash } and never exposes the raw token back', () => {
    const line = encodeHello('cc_realtoken1234567890')

    const parsed = parseHello(line.trimEnd())

    expect(parsed.present).toBe(true)
    expect(parsed.hash).toBe(createHash('sha256').update('cc_realtoken1234567890', 'utf8').digest('hex'))
    expect(JSON.stringify(parsed)).not.toContain('cc_realtoken1234567890')
  })

  it('terminates the encoded line with a single trailing newline', () => {
    expect(encodeHello('cc_x')).toBe('{"token":"cc_x"}\n')
  })

  it('reports present:false for a line missing the token key', () => {
    expect(parseHello('{}')).toEqual({ present: false, hash: '' })
  })

  it('reports present:false, never throwing, for malformed JSON', () => {
    expect(parseHello('not json at all')).toEqual({ present: false, hash: '' })
  })

  it('reports present:false for an empty-string token', () => {
    expect(parseHello('{"token":""}')).toEqual({ present: false, hash: '' })
  })

  it('exposes only present/hash keys on the parsed result, never a token field', () => {
    const parsed = parseHello(encodeHello('cc_anything').trimEnd())

    expect(Object.keys(parsed).sort()).toEqual(['hash', 'present'])
  })
})

describe('encodeAck / parseAck', () => {
  it('round-trips a success ack with no reason', () => {
    const line = encodeAck(true)

    expect(parseAck(line.trimEnd())).toEqual({ ok: true })
  })

  it('round-trips a failure ack carrying a reason', () => {
    const line = encodeAck(false, 'unauthorized')

    expect(parseAck(line.trimEnd())).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('fails closed to { ok: false } on malformed JSON', () => {
    expect(parseAck('garbage')).toEqual({ ok: false })
  })
})

describe('MAX_PREAMBLE_BYTES', () => {
  it('caps the preamble at 4 KiB', () => {
    expect(MAX_PREAMBLE_BYTES).toBe(4096)
  })
})
