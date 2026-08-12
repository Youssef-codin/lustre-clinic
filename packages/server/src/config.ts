/**
 * `.env` holds only non-user-editable values (SPEC §12). Everything the clinic
 * can change is a row in `settings` and is edited in-app.
 *
 * The heartbeat is outbound: nothing can reach the clinic machine from outside
 * the tailnet, so the server pings `HEARTBEAT_URL` and the monitor alerts on
 * silence (§17). `BACKUP_ENCRYPTION_KEY` (32 bytes, hex/base64) is NOT stored on
 * the clinic machine; off-site upload is refused without it and local dumps are
 * unencrypted. Drive backups use a service account and need a shared-drive
 * folder or a `BACKUP_DRIVE_SUBJECT` to impersonate. Drive wins over S3 when
 * both are configured.
 */
import { z } from 'zod';

const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DISCORD_WEBHOOK_URL: z
        .url()
        .optional()
        .or(z.literal('').transform(() => undefined)),
    HEARTBEAT_URL: z
        .url()
        .optional()
        .or(z.literal('').transform(() => undefined)),
    HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),

    BACKUP_ENCRYPTION_KEY: z.string().optional(),
    BACKUP_DIR: z.string().default('./backups'),
    BACKUP_INTERVAL_HOURS: z.coerce.number().positive().default(24),
    BACKUP_STALE_AFTER_HOURS: z.coerce.number().positive().default(48),
    PG_BIN_DIR: z.string().optional(),

    BACKUP_DRIVE_FOLDER_ID: z.string().optional(),
    BACKUP_DRIVE_CLIENT_EMAIL: z.string().optional(),
    BACKUP_DRIVE_PRIVATE_KEY: z.string().optional(),
    BACKUP_DRIVE_SUBJECT: z.string().optional(),

    BACKUP_S3_BUCKET: z.string().optional(),
    BACKUP_S3_ENDPOINT: z.string().optional(),
    BACKUP_S3_REGION: z.string().optional(),
    BACKUP_S3_ACCESS_KEY_ID: z.string().optional(),
    BACKUP_S3_SECRET_ACCESS_KEY: z.string().optional(),
    BACKUP_S3_PREFIX: z.string().default('lustre'),
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
