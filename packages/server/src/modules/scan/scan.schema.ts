import { refParamSchema } from '@mawid/shared';
import type { ValidationSpec } from '../../middleware/validate.ts';

/**
 * `GET /s/:ref` — the QR target printed on every slip and schedule row. The ref
 * format lives in `@mawid/shared` next to `formatAppointmentRef`, so what a
 * camera reads and what the printer wrote are guaranteed to be the same shape.
 */
export const followScanSpec = { params: refParamSchema } satisfies ValidationSpec;
