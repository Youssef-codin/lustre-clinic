import type { HealthResponse } from '@mawid/shared';
import { getStatus } from '../../services/status.ts';
import { VERSION } from '../../version.ts';

const bootedAt = Date.now();

export function readHealth(): HealthResponse {
    const status = getStatus();
    // `degraded` still serves the desk; `down` does not. `disabled` means the
    // clinic turned that component off, which is not a failure.
    const failing = [status.db, status.printer, status.whatsapp].some((s) => s === 'down');

    return {
        ok: !failing,
        version: VERSION,
        migration: status.migration,
        uptimeSeconds: Math.floor((Date.now() - bootedAt) / 1000),
        db: status.db,
        printer: status.printer,
        whatsapp: status.whatsapp,
    };
}
