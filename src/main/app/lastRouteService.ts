import log from 'electron-log'
import { hashFromUrl, parseLaunchRoute } from './launchRoute'

/**
 * Where the last visited route lives: one row in the generic `app_settings`
 * key/value store (`sqliteAppSettingsRepository`), same table `themeService`
 * already uses — a single string value needs no table of its own.
 */
export const LAST_ROUTE_KEY = 'app.lastRoute'

/** The `get`/`set` slice of `AppSettingsRepository` this service needs. */
export interface LastRouteSettingsPort {
  get(key: string): string | null
  set(key: string, value: string | null): void
}

export interface LastRouteService {
  /**
   * The persisted route, validated syntactically (design D7), or `null` when
   * nothing was ever persisted or the stored value fails the guard. Read
   * BEFORE the renderer document loads and seeded as the initial hash — see
   * `src/main/index.ts`'s `createWindow`.
   */
  launchHash(): string | null
  /**
   * Extracts the hash from a navigated-to document URL and persists it when
   * it changed. Called from the `did-navigate-in-page` listener on every
   * in-app route change (design data flow). Never throws — a failing write
   * must not take down the navigation it is reacting to.
   */
  remember(url: string): void
}

interface CreateLastRouteServiceDeps {
  settings: LastRouteSettingsPort
}

export function createLastRouteService({ settings }: CreateLastRouteServiceDeps): LastRouteService {
  return {
    launchHash() {
      return parseLaunchRoute(settings.get(LAST_ROUTE_KEY))
    },
    remember(url) {
      const hash = hashFromUrl(url)
      if (hash === null) return
      if (hash === settings.get(LAST_ROUTE_KEY)) return

      try {
        settings.set(LAST_ROUTE_KEY, hash)
      } catch (error) {
        log.warn(
          `Failed to persist the last visited route: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }
  }
}
