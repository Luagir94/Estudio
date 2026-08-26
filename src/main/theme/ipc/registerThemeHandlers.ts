import { ipcMain } from 'electron'
import log from 'electron-log'
import { ipcErr, ipcOk, parsePayload, type IpcResult } from '../../../shared/ipc/materias'
import {
  setPaletteInputSchema,
  setThemePreferenceInputSchema,
  type Palette,
  type ThemePreference
} from '../../../shared/ipc/theme'
import type { ThemeService } from '../themeService'

interface RegisterThemeHandlersDeps {
  themeService: ThemeService
}

/**
 * Registers the `theme:*` main-process handlers. Every branch returns an
 * `IpcResult` — nothing ever throws across the bridge — and the persistence
 * and the `nativeTheme` write both live in `themeService`, never here: the
 * handlers only compose it, same split as `registerCliHandlers`.
 *
 * `theme:setPreference` applies AND persists in one round trip, then echoes
 * the persisted value, so the renderer can write the response straight into
 * its cache without a second read.
 */
export function registerThemeHandlers({ themeService }: RegisterThemeHandlersDeps): void {
  ipcMain.handle('theme:getPreference', async (): Promise<IpcResult<ThemePreference>> => {
    try {
      return ipcOk(themeService.getPreference())
    } catch (error) {
      log.error('theme:getPreference failed', error)
      return ipcErr('THEME_READ_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('theme:setPreference', async (_event, payload): Promise<IpcResult<ThemePreference>> => {
    const parsed = parsePayload(setThemePreferenceInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(themeService.setPreference(parsed.data.preference))
    } catch (error) {
      log.error('theme:setPreference failed', error)
      return ipcErr('THEME_WRITE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // The palette pair mirrors the preference pair channel for channel, minus
  // the apply: `theme:setPalette` only persists, because the renderer is what
  // puts the choice on `<html data-palette>`. Same echo-the-persisted-value
  // contract, so the renderer still writes the response straight into its
  // cache without a second read.
  ipcMain.handle('theme:getPalette', async (): Promise<IpcResult<Palette>> => {
    try {
      return ipcOk(themeService.getPalette())
    } catch (error) {
      log.error('theme:getPalette failed', error)
      return ipcErr('PALETTE_READ_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('theme:setPalette', async (_event, payload): Promise<IpcResult<Palette>> => {
    const parsed = parsePayload(setPaletteInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(themeService.setPalette(parsed.data.palette))
    } catch (error) {
      log.error('theme:setPalette failed', error)
      return ipcErr('PALETTE_WRITE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
