import { defineConfig } from 'drizzle-kit';

/**
 * Generate-and-commit only. Never run `drizzle-kit push` against a clinic
 * install — migrations are versioned artefacts, applied on boot. See spec §5.
 */
export default defineConfig({
    dialect: 'sqlite',
    schema: './src/db/schema.ts',
    out: './src/db/migrations',
    strict: true,
    verbose: true,
});
