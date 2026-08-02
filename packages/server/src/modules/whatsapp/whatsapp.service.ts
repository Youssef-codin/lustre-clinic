import type { WhatsAppStatus, WhatsAppTestResult } from '@mawid/shared';
import { ERROR_CODE } from '@mawid/shared';
import { getConfig } from '../../config/index.ts';
import { AppError } from '../../errors/AppError.ts';
import { logger } from '../../middleware/logger.ts';
import { renderReminder } from '../../services/reminders/template.ts';
import { getSender, getWhatsAppStatus, logoutWhatsApp } from '../../services/whatsapp/index.ts';
import { normalizePhone } from '../patient/patient.service.ts';

export function readStatus(): WhatsAppStatus {
    return getWhatsAppStatus();
}

/**
 * Unlinks the device and returns the state that leaves behind, so the desk
 * renders the result of the click without waiting for the pushed event.
 */
export function logout(): Promise<WhatsAppStatus> {
    return logoutWhatsApp();
}

/**
 * Marks the message as a test in both languages. A clinic's test number is
 * usually somebody's personal phone, and a message that reads exactly like a
 * real appointment reminder is one someone will act on.
 */
const TEST_MARKER = 'رسالة تجريبية · Test message';

/** Stands in for `{patient}`. Never a real-looking name, for the same reason. */
const TEST_PATIENT = 'تجربة · Test';

/**
 * The clinic's own template, rendered and sent for real. Anything less does not
 * answer the question the button exists to answer — whether the Arabic arrives
 * readable on a real handset, which nothing server-side can settle.
 */
export async function sendTest(): Promise<WhatsAppTestResult> {
    const config = getConfig();
    const configured = config.whatsapp.testNumber;

    if (!configured) {
        throw AppError.badRequest(
            'No whatsapp.testNumber is set in config.json',
            ERROR_CODE.WHATSAPP_NO_TEST_NUMBER,
        );
    }

    const sender = getSender();
    if (!sender?.status().connected) {
        throw new AppError(
            409,
            ERROR_CODE.WHATSAPP_DISCONNECTED,
            'WhatsApp is not connected — link it before sending a test',
        );
    }

    // Dated as a real reminder would be, so the rendered day and time read the
    // way a patient's does rather than as today at whatever o'clock it is.
    const startsAt = new Date(Date.now() + config.reminders.hoursBefore * 3_600_000).toISOString();
    const body = `${TEST_MARKER}\n\n${renderReminder(config.reminders.template, TEST_PATIENT, startsAt, config)}`;

    const to = normalizePhone(configured);
    await sender.send(to, body);

    // Logged in full, unlike a patient's number: this one is in config, chosen
    // by the clinic, and a visible trail is most of the point of the button.
    logger.info({ to, sender: sender.name }, 'whatsapp test message sent');

    return { to, dryRun: getWhatsAppStatus().dryRun };
}
