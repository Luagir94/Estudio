import { defineConfig } from 'drizzle-kit'

// No domain schema exists yet (slice 1 ships only the migration/backup
// infrastructure). `src/main/db/schema.ts` is a placeholder that later
// slices extend with `subjects`, `schedule_slots`, and `deadlines`.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle/migrations'
})
