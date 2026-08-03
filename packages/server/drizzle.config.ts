import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/db/schema.ts',
    out: './src/db/migrations',
    dbCredentials: {
        // drizzle-kit runs under Node, not Bun, so this reads process.env.
        url: process.env.DATABASE_URL ?? 'postgres://mawid:mawid@localhost:5432/mawid',
    },
    casing: 'snake_case',
    verbose: true,
    strict: true,
});
