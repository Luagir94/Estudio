import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import type { AcademicDateRepository } from '../../fechas/adapters/sqliteAcademicDateRepository'
import type { ClaseRepository } from '../../clases/adapters/sqliteClaseRepository'
import type { DeadlineRepository } from '../../entregas/adapters/sqliteDeadlineRepository'
import type { FinalExamRepository } from '../../finales/adapters/sqliteFinalExamRepository'
import type { MateriasService } from '../../materias/materiasService'
import type { SubjectRepository } from '../../materias/adapters/sqliteSubjectRepository'
import type { PartialExamRepository } from '../../parciales/adapters/sqlitePartialExamRepository'
import type { ProgramRepository } from '../../carreras/adapters/sqliteProgramRepository'
import { MCP_SLICE_CAPABILITIES } from '../../../shared/mcp/sliceCapabilities'
import { createConnectionMcpServer } from '../adapters/mcpServerFactory'
import { MCP_SLICES } from '../domain/permissions'
import { createCarrerasTools } from './carrerasTools'
import { createClasesTools } from './clasesTools'
import { createEntregasTools } from './entregasTools'
import { createFechasTools } from './fechasTools'
import { createFinalesTools } from './finalesTools'
import { createHorarioTools } from './horarioTools'
import { createMateriasTools } from './materiasTools'
import { createParcialesTools } from './parcialesTools'

// The catalog test (task 8.4): the acceptance gate for the WHOLE tool
// surface built across PR5-8 — spec "mcp-academic-tools", requirement
// "Exactly 32 tools across 8 curated slices". Assembles every one of the 8
// tool-factory modules with fake repositories, feeds their combined
// descriptors into the SAME `createConnectionMcpServer` a live connection
// uses, and asserts against a REAL `tools/list` round trip over
// `InMemoryTransport` (same technique every prior preprocess-audit test in
// this change uses), not just against the raw descriptor array — the spec
// scenario is phrased in terms of what a connecting client sees.
//
// The arithmetic the mission's own scope contract commits to: materias 6 +
// horario 1 + carreras 8 + entregas 5 + fechas 4 + clases 2 + parciales 3 +
// finales 3 = 32 (7 read + 25 write).

function fakeSubjectRepository(): SubjectRepository {
  return {
    create: vi.fn(),
    list: vi.fn(() => []),
    detail: vi.fn(() => null),
    updateSchedule: vi.fn(),
    remove: vi.fn(),
    setOutcome: vi.fn(() => null)
  }
}

function fakeMateriasService(): MateriasService {
  return { deleteSubject: vi.fn() }
}

function fakeProgramRepository(): ProgramRepository {
  return {
    create: vi.fn(),
    list: vi.fn(() => []),
    detail: vi.fn(() => null),
    update: vi.fn(() => null),
    createPeriod: vi.fn(),
    updatePeriod: vi.fn(() => null),
    removePeriod: vi.fn(() => null),
    remove: vi.fn(() => null)
  }
}

function fakeDeadlineRepository(): DeadlineRepository {
  return {
    create: vi.fn(),
    list: vi.fn(() => []),
    update: vi.fn(() => null),
    setDone: vi.fn(() => null),
    remove: vi.fn(() => false)
  }
}

function fakeAcademicDateRepository(): AcademicDateRepository {
  return {
    create: vi.fn(),
    list: vi.fn(() => []),
    listByProgram: vi.fn(() => []),
    update: vi.fn(() => null),
    remove: vi.fn(() => false)
  }
}

function fakeClaseRepository(): ClaseRepository {
  return {
    setAttendance: vi.fn(),
    clearAttendance: vi.fn(() => false),
    listAttendanceBySubject: vi.fn(() => []),
    listAttendance: vi.fn(() => []),
    listNotesBySubject: vi.fn(() => []),
    listNotes: vi.fn(() => [])
  }
}

function fakePartialExamRepository(): PartialExamRepository {
  return { create: vi.fn(), listBySubject: vi.fn(() => []), update: vi.fn(() => null), remove: vi.fn(() => false) }
}

function fakeFinalExamRepository(): FinalExamRepository {
  return { create: vi.fn(), listBySubject: vi.fn(() => []), update: vi.fn(() => null), remove: vi.fn(() => false) }
}

function buildAllDescriptors() {
  return [
    ...createMateriasTools({ repository: fakeSubjectRepository(), materiasService: fakeMateriasService() }),
    ...createHorarioTools({ repository: fakeSubjectRepository() }),
    ...createCarrerasTools({ repository: fakeProgramRepository() }),
    ...createEntregasTools({ repository: fakeDeadlineRepository() }),
    ...createFechasTools({ repository: fakeAcademicDateRepository() }),
    ...createClasesTools({ repository: fakeClaseRepository() }),
    ...createParcialesTools({ repository: fakePartialExamRepository() }),
    ...createFinalesTools({ repository: fakeFinalExamRepository() })
  ]
}

const OUT_OF_SCOPE_PREFIXES = ['adjuntos_', 'indexado_', 'ask_', 'cli_', 'theme_', 'app_', 'planificador_', 'hoy_']

describe('MCP tool catalog (PR5-8 combined, task 8.4)', () => {
  it('the combined descriptor array totals exactly 32 tools: 7 read + 25 write', () => {
    const descriptors = buildAllDescriptors()

    expect(descriptors).toHaveLength(32)
    expect(descriptors.filter((tool) => tool.action === 'read')).toHaveLength(7)
    expect(descriptors.filter((tool) => tool.action === 'write')).toHaveLength(25)
  })

  it('a connecting client sees exactly 32 tools via a real tools/list round trip', async () => {
    const { server } = createConnectionMcpServer(buildAllDescriptors(), { authorize: () => true, audit: vi.fn() })
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'catalog-test-client', version: '0.0.0' })

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    const { tools } = await client.listTools()

    expect(tools).toHaveLength(32)
  })

  it('contains no tool for an out-of-scope slice (adjuntos, indexado, ask, cli, theme, app, planificador, hoy)', () => {
    const names = buildAllDescriptors().map((tool) => tool.name)

    for (const prefix of OUT_OF_SCOPE_PREFIXES) {
      expect(names.some((name) => name.startsWith(prefix))).toBe(false)
    }
  })

  it('has no clases_save_note/clases_delete_note equivalent — clases exposes attendance only (spec requirement)', () => {
    const names = buildAllDescriptors().map((tool) => tool.name)
    const clasesNames = names.filter((name) => name.startsWith('clases_'))

    expect(clasesNames).toEqual(['clases_set_attendance', 'clases_clear_attendance'])
    expect(names).not.toContain('clases_save_note')
    expect(names).not.toContain('clases_delete_note')
  })

  it('every tool name is unique across all 8 slices', () => {
    const names = buildAllDescriptors().map((tool) => tool.name)

    expect(new Set(names).size).toBe(names.length)
  })

  // The other half of the parity guard `shared/mcp/sliceCapabilities.ts`'s
  // own header describes (mcp-app-control task 16.1/16.2): that module is
  // the renderer's single source of truth for which read/write toggle a
  // permissions-card row may show, pinned to THIS catalog rather than to the
  // approved `.pen` design's row prose. This test is the guard that keeps
  // the two from drifting apart — a future catalog change that adds or
  // removes a slice's only read or write tool fails HERE, not silently in
  // the renderer.
  it('MCP_SLICE_CAPABILITIES (renderer-facing) matches which read/write actions each slice actually has', () => {
    const descriptors = buildAllDescriptors()

    for (const slice of MCP_SLICES) {
      const sliceTools = descriptors.filter((tool) => tool.slice === slice)
      expect(MCP_SLICE_CAPABILITIES[slice]).toEqual({
        hasRead: sliceTools.some((tool) => tool.action === 'read'),
        hasWrite: sliceTools.some((tool) => tool.action === 'write')
      })
    }
  })
})
