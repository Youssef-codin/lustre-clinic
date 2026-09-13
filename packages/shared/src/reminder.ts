/**
 * SPEC §11 — the text of a reminder and the WhatsApp link that carries it. Run
 * by the server and by the demo backend, so the message a demo shows is the one
 * the clinic would send.
 *
 * Times are shifted into the clinic's local day before formatting, because
 * `startsAt` is UTC. An unknown `{{placeholder}}` is left visible, not dropped,
 * so a typo in the template shows rather than vanishing.
 */
import { REMINDER_PLACEHOLDERS } from './constants.ts';

export function renderTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
        (REMINDER_PLACEHOLDERS as readonly string[]).includes(key) ? (values[key] ?? whole) : whole,
    );
}

/** `wa.me` takes the number without its `+`. */
export function toWhatsAppNumber(e164: string): string {
    return e164.replace(/^\+/, '');
}

export interface ReminderMessageInput {
    template: string;
    clinicName: string;
    name: string;
    phone: string;
    ref: string;
    startsAt: Date;
    offsetMinutes: number;
}

export function reminderMessage(input: ReminderMessageInput): { message: string; whatsAppUrl: string } {
    const local = new Date(input.startsAt.getTime() + input.offsetMinutes * 60_000);

    const message = renderTemplate(input.template, {
        name: input.name,
        clinic: input.clinicName,
        date: local.toISOString().slice(0, 10),
        time: local.toISOString().slice(11, 16),
        ref: input.ref,
    });

    return {
        message,
        whatsAppUrl: `https://wa.me/${toWhatsAppNumber(input.phone)}?text=${encodeURIComponent(message)}`,
    };
}
