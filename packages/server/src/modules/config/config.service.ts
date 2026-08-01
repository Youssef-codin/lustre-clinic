import type { PublicConfig } from '@mawid/shared';
import { getConfig } from '../../config/index.ts';

/**
 * Only the clinic-facing slice leaves the server. Printer names, WhatsApp
 * session paths and backup destinations stay on the PC.
 */
export function readPublicConfig(): PublicConfig {
    const { clinic, hours, appointmentTypes, defaultLocale } = getConfig();
    return { clinic, hours, appointmentTypes, defaultLocale };
}
