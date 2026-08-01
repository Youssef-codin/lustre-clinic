import { clinicAddress, clinicName } from '@mawid/shared';
import type { Config } from '../../config/index.ts';
import { toClinicClock } from '../../util/time.ts';

/**
 * The message body, from `config.reminders.template`. Wording differs between
 * the two clinics, so every word of it is config — see spec §15.
 *
 * Placeholders: `{patient}` `{clinic}` `{date}` `{time}` `{address}` `{phone}`.
 * An unknown placeholder is left as written rather than replaced with an empty
 * string, so a typo in config shows up in the message instead of silently
 * sending a sentence with a hole in it.
 */
export function renderReminder(
    template: string,
    patientName: string,
    startsAt: string,
    config: Config,
): string {
    const locale = config.defaultLocale;
    const { timezone } = config.clinic;

    const formatted = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn', {
        timeZone: timezone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date(startsAt));

    const values: Record<string, string> = {
        patient: patientName,
        clinic: clinicName(config.clinic, locale),
        date: formatted,
        time: toClinicClock(startsAt, timezone).time,
        address: clinicAddress(config.clinic, locale),
        phone: config.clinic.phone,
    };

    return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}
