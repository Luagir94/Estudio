// Intentionally invalid fixture — proves the dependency guard flags TYPE-ONLY
// electron imports in `domain/` layers. Unlike the child_process rule, rule 1
// deliberately has no type-only exemption: a domain module that names Electron
// types is already coupled to the framework it must stay free of. It exists
// only so `tooling/dependencyGuard.test.ts` has something to catch.
import type { BrowserWindow } from 'electron'

export type ForbiddenWindowRef = { window: BrowserWindow | null }
