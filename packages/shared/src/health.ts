/** `GET /api/health` — what the desk screen banner and any future monitor read. */

export type ComponentStatus = 'ok' | 'degraded' | 'down' | 'disabled';

export interface HealthResponse {
    ok: boolean;
    version: string;
    /** Applied drizzle migration tag, or null before the db exists. */
    migration: string | null;
    uptimeSeconds: number;
    db: ComponentStatus;
    printer: ComponentStatus;
    whatsapp: ComponentStatus;
}
