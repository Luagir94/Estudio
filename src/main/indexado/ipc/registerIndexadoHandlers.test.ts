import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IndexadoService } from '../indexadoService'

const { ipcMainMock } = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
  return {
    ipcMainMock: {
      handlers,
      handle: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener)
      })
    }
  }
})

const logErrorMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ ipcMain: ipcMainMock }))
vi.mock('electron-log', () => ({ default: { error: logErrorMock } }))

import { registerIndexadoHandlers } from './registerIndexadoHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

describe('registerIndexadoHandlers', () => {
  let service: IndexadoService

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    service = {
      enqueue: vi.fn(),
      syncAll: vi.fn().mockReturnValue(3),
      whenIdle: vi.fn().mockResolvedValue(undefined)
    }
    registerIndexadoHandlers({ service })
  })

  it('indexado:sync calls service.syncAll() and returns its count wrapped in the ok envelope', () => {
    const result = invoke('indexado:sync')

    expect(service.syncAll).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, data: { enqueued: 3 } })
  })

  it('indexado:sync never throws across the bridge when the service throws synchronously', () => {
    service.syncAll = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerIndexadoHandlers({ service })

    const result = invoke('indexado:sync')

    expect(result).toMatchObject({ ok: false, error: { code: 'SYNC_FAILED' } })
  })

  it('logs the unexpected service failure with its channel name', () => {
    service.syncAll = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerIndexadoHandlers({ service })

    invoke('indexado:sync')

    expect(logErrorMock).toHaveBeenCalledWith('indexado:sync failed', expect.any(Error))
  })
})
