import { z } from 'zod';

/**
 * `.env` holds only non-user-editable values (SPEC §12). Everything the clinic
 * can change is a row in `settings` and is edited in-app.
 */
const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** §17 — the app reporting its own failures. Disabled when unset. */
    DISCORD_WEBHOOK_URL: z
        .url()
        .optional()
        .or(z.literal('').transform(() => undefined)),
    /**
     * §17 — the external check that the machine is responding. Nothing can
     * reach the clinic machine from outside the tailnet, so the heartbeat is
     * outbound: the server pings this URL and the monitor alerts on silence.
     * Disabled when unset.
     */
    HEARTBEAT_URL: z
        .url()
        .optional()
        .or(z.literal('').transform(() => undefined)),
    /** How often the heartbeat is sent. Keep it well under the monitor's window. */
    HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),

    /**
     * §16 — 32 bytes, hex or base64. Used to encrypt a dump before it leaves
     * the machine. It is NOT stored on the clinic machine; off-site upload is
     * refused without it. Local dumps are unencrypted, because the disk they
     * sit on is the same disk Postgres is on.
     */
    BACKUP_ENCRYPTION_KEY: z.string().optional(),
    /** Where local dumps live. Mounted as a volume in compose. */
    BACKUP_DIR: z.string().default('./backups'),
    BACKUP_INTERVAL_HOURS: z.coerce.number().positive().default(24),
    /** §16 — alert when no backup has succeeded in this long. */
    BACKUP_STALE_AFTER_HOURS: z.coerce.number().positive().default(48),
    /** Set when `pg_dump`/`pg_restore` are not on PATH. */
    PG_BIN_DIR: z.string().optional(),

    /** Off-site destination (§16). Uploads are skipped when unset. */
    BACKUP_S3_BUCKET: z.string().optional(),
    BACKUP_S3_ENDPOINT: z.string().optional(),
    BACKUP_S3_REGION: z.string().optional(),
    BACKUP_S3_ACCESS_KEY_ID: z.string().optional(),
    BACKUP_S3_SECRET_ACCESS_KEY: z.string().optional(),
    BACKUP_S3_PREFIX: z.string().default('mawid'),
});

export type Config = z.infer<typeof envSchema>;

function load(): Config {
    const parsed = envSchema.safeParse(Bun.env);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
        throw new Error(`Invalid environment:\n${issues}`);
    }
    return parsed.data;
}

export const config = load();
