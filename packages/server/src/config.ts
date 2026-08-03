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
    /** §16 — not stored on the clinic machine. */
    BACKUP_ENCRYPTION_KEY: z.string().optional(),
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
