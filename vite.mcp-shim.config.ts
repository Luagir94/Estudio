import { resolve } from 'node:path'
import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

// Standalone build for the MCP stdio shim (design D2, B1 build-chain fix).
// This is a PLAIN `vite build`, not `electron-vite build`: electron-vite
// only understands `main | preload | renderer` inputs and would emit a
// second entry into `out/main/`, packed inside `app.asar` where the system
// Node that spawns this shim cannot read it (design "Why not a second
// electron-vite input"). A standalone Vite lib build inlines every
// non-builtin dependency (`zod`, `src/shared/mcp/**`) into ONE file instead,
// so `out/mcp-shim/index.cjs` runs standalone once copied out by
// electron-builder's `extraResources` (`electron-builder.yml`).
//
// `external` covers Node builtins ONLY — everything else, including `zod`,
// must be bundled: the packaged shim ships next to the app, not inside
// `node_modules`, so nothing beyond the Node runtime itself can be assumed
// present at spawn time.
const nodeBuiltins = new Set(builtinModules)

export default defineConfig({
  build: {
    outDir: 'out/mcp-shim',
    emptyOutDir: true,
    target: 'node20',
    lib: {
      entry: resolve(__dirname, 'src/mcp-shim/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.cjs'
    },
    rollupOptions: {
      external: (id: string) => id.startsWith('node:') || nodeBuiltins.has(id)
    }
  }
})
