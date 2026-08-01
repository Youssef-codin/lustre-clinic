import type { ComponentStatus } from '@mawid/shared';

/**
 * Live health of the long-running services. Each service updates its own entry
 * as it connects, fails or reconnects; `/api/health` and the desk screen banner
 * read from here. Everything starts `down` until something proves otherwise —
 * a silent failure must never look healthy.
 */
export interface SystemStatus {
    db: ComponentStatus;
    printer: ComponentStatus;
    whatsapp: ComponentStatus;
    /** Applied drizzle migration tag, set after migrations run at boot. */
    migration: string | null;
}

const status: SystemStatus = {
    db: 'down',
    printer: 'down',
    whatsapp: 'down',
    migration: null,
};

export function getStatus(): Readonly<SystemStatus> {
    return status;
}

export function setStatus<K extends keyof SystemStatus>(key: K, value: SystemStatus[K]): void {
    status[key] = value;
}
