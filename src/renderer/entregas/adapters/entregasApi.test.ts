// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'
import { entregasApi } from './entregasApi'

const sampleDeadline: DeadlineWithSubject = {
  id: 1,
  subjectId: 1,
  title: 'TP 2 — Scheduler',
  type: 'Trabajo práctico',
  dueAt: '2027-08-18T23:59',
  done: false,
  subjectName: 'Sistemas Operativos',
  subjectColor: '#4c8dff'
}

describe('entregasApi', () => {
  beforeEach(() => {
    // @ts-expect-error test-only global stub
    window.api = {
      entregas: {
        create: vi.fn(),
        list: vi.fn(),
        update: vi.fn(),
        setDone: vi.fn(),
        delete: vi.fn()
      }
    }
  })

  it('create parses and returns the created deadline on success', async () => {
    vi.mocked(window.api.entregas.create).mockResolvedValue({ ok: true, data: sampleDeadline })

    const result = await entregasApi.create({
      title: 'TP 2 — Scheduler',
      subjectId: 1,
      type: 'Trabajo práctico',
      dueAt: '2027-08-18T23:59'
    })

    expect(result).toEqual(sampleDeadline)
  })

  it('create throws when the envelope reports ok: false', async () => {
    vi.mocked(window.api.entregas.create).mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'bad input' }
    })

    await expect(entregasApi.create({ title: '', subjectId: 1, type: 'X', dueAt: '2027-08-18T23:59' })).rejects.toThrow(
      'bad input'
    )
  })

  it('list parses and returns every deadline', async () => {
    vi.mocked(window.api.entregas.list).mockResolvedValue({ ok: true, data: [sampleDeadline] })

    const result = await entregasApi.list()

    expect(result).toEqual([sampleDeadline])
  })

  it('update parses and returns the updated deadline', async () => {
    vi.mocked(window.api.entregas.update).mockResolvedValue({ ok: true, data: sampleDeadline })

    const result = await entregasApi.update({
      id: 1,
      title: 'TP 2',
      subjectId: 1,
      type: 'Trabajo práctico',
      dueAt: '2027-08-25T23:59'
    })

    expect(result).toEqual(sampleDeadline)
  })

  it('setDone parses and returns the toggled deadline', async () => {
    vi.mocked(window.api.entregas.setDone).mockResolvedValue({ ok: true, data: { ...sampleDeadline, done: true } })

    const result = await entregasApi.setDone({ id: 1, done: true })

    expect(result.done).toBe(true)
  })

  it('delete parses and returns the deleted id', async () => {
    vi.mocked(window.api.entregas.delete).mockResolvedValue({ ok: true, data: { id: 1 } })

    const result = await entregasApi.delete(1)

    expect(result).toEqual({ id: 1 })
  })
})
