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
import { annotationsFor } from '../domain/toolAnnotations'
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

async function listCatalogTools(descriptors = buildAllDescriptors()) {
  const { server } = createConnectionMcpServer(descriptors, { authorize: () => true, audit: vi.fn() })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'catalog-test-client', version: '0.0.0' })

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client.listTools()
}

const OUT_OF_SCOPE_PREFIXES = ['adjuntos_', 'indexado_', 'ask_', 'cli_', 'theme_', 'app_', 'planificador_', 'hoy_']

/**
 * One tool per annotation kind, written out by hand rather than derived, so
 * this file still fails if `annotationsFor`'s own table is changed to
 * something wrong — a test that only compared the catalog against that same
 * function would happily agree with it either way.
 */
const EXPECTED_ANNOTATIONS = {
  materias_list: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  horario_week: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  materias_create: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  carreras_update: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  carreras_delete: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  entregas_set_done: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  clases_clear_attendance: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
}

describe('MCP tool catalog (PR5-8 combined, task 8.4)', () => {
  it('the combined descriptor array totals exactly 32 tools: 7 read + 25 write', () => {
    const descriptors = buildAllDescriptors()

    expect(descriptors).toHaveLength(32)
    expect(descriptors.filter((tool) => tool.action === 'read')).toHaveLength(7)
    expect(descriptors.filter((tool) => tool.action === 'write')).toHaveLength(25)
  })

  it('a connecting client sees exactly 32 tools via a real tools/list round trip', async () => {
    const { tools } = await listCatalogTools()

    expect(tools).toHaveLength(32)
  })

  // Annotations are what a client reads to decide whether it may run a tool
  // without stopping to ask the user. These three tests cover the whole
  // chain: that the derivation is applied at all, that it survives the trip
  // to `tools/list`, and — against a table written out by hand here, not by
  // calling the same function under test — that it says the right thing.
  it('advertises all four annotation hints on every tool a client can see', async () => {
    const { tools } = await listCatalogTools()

    for (const tool of tools) {
      expect(tool.annotations, `${tool.name} advertises no annotations`).toEqual({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        idempotentHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean)
      })
    }
  })

  it('advertises exactly the annotations each tool declares through its action and effect', async () => {
    const descriptors = buildAllDescriptors()
    const byName = new Map(descriptors.map((tool) => [tool.name, tool]))
    const { tools } = await listCatalogTools(descriptors)

    for (const tool of tools) {
      expect(tool.annotations, tool.name).toEqual(annotationsFor(byName.get(tool.name)!))
    }
  })

  it('never advertises a write tool as read-only, and marks every delete destructive', async () => {
    // The failure this rules out is the expensive one: a client auto-running
    // `carreras_delete` because the tool advertised itself as read-only.
    const descriptors = buildAllDescriptors()
    const byName = new Map(descriptors.map((tool) => [tool.name, tool]))
    const { tools } = await listCatalogTools(descriptors)

    for (const tool of tools) {
      const descriptor = byName.get(tool.name)!
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(descriptor.action === 'read')
      expect(tool.annotations?.openWorldHint, tool.name).toBe(false)
      if (descriptor.action === 'write' && descriptor.effect === 'delete') {
        expect(tool.annotations?.destructiveHint, tool.name).toBe(true)
      }
    }
  })

  it('advertises the hand-written expectations for one tool of every kind', async () => {
    const { tools } = await listCatalogTools()
    const byName = new Map(tools.map((tool) => [tool.name, tool.annotations]))

    for (const [name, expected] of Object.entries(EXPECTED_ANNOTATIONS)) {
      expect(byName.get(name), name).toEqual(expected)
    }
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
