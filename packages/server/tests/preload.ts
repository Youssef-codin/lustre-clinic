/**
 * Runs before any test file is imported (see `bunfig.toml`).
 *
 * `src/config.ts` reads `Bun.env` at module load, and the suite truncates every
 * table between tests. Left alone, a bare `bun test` would pick up `.env` — the
 * developer's working database — and destroy it. Loading `.env.test` here means
 * the safe database is the default no matter how the runner is invoked, rather
 * than only when someone remembers to pass `--env-file`.
 *
 * An explicitly exported `DATABASE_URL` still wins, provided it names a test
 * database; CI relies on nothing here beyond that.
 */

const ENV_FILE = new URL('../.env.test', import.meta.url).pathname;

function parseEnvFile(contents: string): Record<string, string> {
    const values: Record<string, string> = {};

    for (const line of contents.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;

        const key = trimmed.slice(0, eq).trim();
        // Empty is meaningful here: `.env.test` blanks the Drive and Discord
        // keys precisely so a test run cannot reach the network (§16, §17).
        values[key] = trimmed
            .slice(eq + 1)
            .trim()
            .replace(/^["']|["']$/g, '');
    }

    return values;
}

const file = Bun.file(ENV_FILE);
if (!(await file.exists())) {
    throw new Error(`missing ${ENV_FILE} — the test suite has no database to run against`);
}

const testEnv = parseEnvFile(await file.text());
const explicitDatabaseUrl = Bun.env.DATABASE_URL;

for (const [key, value] of Object.entries(testEnv)) {
    Bun.env[key] = value;
}

// Honour a deliberate override — a scratch database, or CI's service container
// — but only when it is a test database. `assertTestDatabase` in
// `helpers/db.ts` is the backstop that refuses anything else.
if (explicitDatabaseUrl?.endsWith('_test')) {
    Bun.env.DATABASE_URL = explicitDatabaseUrl;
}
