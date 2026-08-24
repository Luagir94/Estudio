import type { MenuItemConstructorOptions } from 'electron'
import mainI18n from '../i18n'

/**
 * Builds the native "Archivo" (File) menu template (spec: "Export from File
 * menu" — "the same export flow triggers as from the sidebar footer"). The
 * click handler runs in MAIN, so it does NOT call `app:exportJson` directly
 * — it invokes `onExport`, which `src/main/index.ts` wires to send the
 * `menu:export-requested` push event to the focused renderer. The renderer
 * then calls the exact SAME `appApi.exportJson()` mutation the sidebar
 * footer button uses, guaranteeing an identical flow rather than a second,
 * divergent implementation.
 *
 * Pure and Electron-`Menu`-free on purpose — `Menu.buildFromTemplate` is
 * called by the caller, keeping this function unit-testable without a real
 * Electron runtime.
 */
export function buildFileMenuTemplate(onExport: () => void): MenuItemConstructorOptions[] {
  return [
    {
      label: mainI18n.t('exportMenu.archivo'),
      submenu: [
        { label: mainI18n.t('exportMenu.exportarDatos'), accelerator: 'CmdOrCtrl+E', click: () => onExport() },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ]
}
