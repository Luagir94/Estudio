import { describe, expect, it, vi } from 'vitest'
import { buildFileMenuTemplate } from './exportMenu'

/**
 * Pure template builder — no Electron Menu/BrowserWindow required (spec:
 * "Export from File menu" — "the same export flow triggers as from the
 * sidebar footer"). `Menu.buildFromTemplate` + wiring happens in
 * `src/main/index.ts`, kept out of this test on purpose.
 */
describe('buildFileMenuTemplate', () => {
  it('has a top-level "Archivo" menu containing an export item', () => {
    const template = buildFileMenuTemplate(vi.fn())

    const archivo = template.find((item) => item.label === 'Archivo')
    expect(archivo).toBeDefined()
    expect(archivo?.submenu).toBeDefined()
  })

  it('clicking the export menu item calls the provided callback', () => {
    const onExport = vi.fn()
    const template = buildFileMenuTemplate(onExport)

    const archivo = template.find((item) => item.label === 'Archivo')
    const submenu = archivo?.submenu as { label?: string; click?: () => void }[]
    const exportItem = submenu.find((item) => item.label?.startsWith('Exportar datos'))

    expect(exportItem).toBeDefined()
    exportItem?.click?.()

    expect(onExport).toHaveBeenCalledTimes(1)
  })
})
