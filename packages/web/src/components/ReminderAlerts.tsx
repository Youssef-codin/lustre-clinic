import type { ReminderSkipReason, RemindersResponse, ReminderWithPatient } from '@mawid/shared';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { useServerEvent } from '../contexts/SocketContext.tsx';
import type { TranslationKey } from '../i18n/index.ts';
import { clinicDay, formatClinicDate, formatClinicTime } from '../lib/datetime.ts';

const REASON_KEY: Record<ReminderSkipReason, TranslationKey> = {
    started: 'reminder.reason.started',
    too_late: 'reminder.reason.too_late',
    cancelled: 'reminder.reason.cancelled',
    catch_up_cap: 'reminder.reason.catch_up_cap',
};

/**
 * "These patients were not reminded" (spec §9). The manual fallback is the
 * recovery path for the whole reminder system, so it has to be visible and it
 * has to carry a phone number — the secretary reads this and picks up the
 * handset. Making her click into each row would defeat the point.
 *
 * Failed and skipped are shown together: both mean nobody told the patient.
 * Sent and pending are not failures and would only bury the rows that matter.
 */
export function ReminderAlerts({ fetched }: { fetched: RemindersResponse }) {
    const { config } = useConfig();
    const { locale, t } = useI18n();
    const [live, setLive] = useState<ReminderWithPatient[]>([]);
    const [dismissed, setDismissed] = useState<number[]>([]);

    const record = (reminder: ReminderWithPatient) => {
        setLive((current) => [...current.filter((r) => r.id !== reminder.id), reminder]);
    };

    useServerEvent('reminder:failed', record);
    useServerEvent('reminder:skipped', record);
    // A retry that finally lands must take the row away again.
    useServerEvent('reminder:sent', record);

    const needCalling = useMemo(() => {
        const byId = new Map<number, ReminderWithPatient>();
        // Live last: it is the newer truth for the same row, and a `sent` here
        // supersedes a `failed` that the loader still remembers.
        for (const reminder of [...fetched, ...live]) byId.set(reminder.id, reminder);

        return [...byId.values()]
            .filter((r) => r.status === 'failed' || r.status === 'skipped')
            .filter((r) => !dismissed.includes(r.id))
            .sort((a, b) => a.appointmentStartsAt.localeCompare(b.appointmentStartsAt));
    }, [fetched, live, dismissed]);

    if (needCalling.length === 0) return null;

    const timezone = config?.clinic.timezone;

    return (
        <section
            role="alert"
            className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4"
            aria-labelledby="reminder-alerts-heading"
        >
            <h2 id="reminder-alerts-heading" className="font-semibold text-amber-900">
                {t('reminder.notRemindedHeading')}
            </h2>
            <p className="mb-3 text-sm text-amber-800">{t('reminder.callThem')}</p>

            <ul className="grid gap-2">
                {needCalling.map((reminder) => (
                    <li
                        key={reminder.id}
                        className="flex flex-wrap items-center gap-3 rounded-md bg-white px-3 py-2.5"
                    >
                        <div className="min-w-0 flex-1">
                            <Link
                                to="/p/$patientId"
                                params={{ patientId: reminder.patient.id }}
                                className="font-medium text-slate-900 underline-offset-4 hover:underline"
                            >
                                {reminder.patient.name}
                            </Link>
                            <p className="mt-0.5 text-sm text-slate-600">
                                {timezone
                                    ? t('reminder.when', {
                                          date: formatClinicDate(
                                              clinicDay(reminder.appointmentStartsAt, timezone),
                                              locale,
                                          ),
                                          time: formatClinicTime(
                                              reminder.appointmentStartsAt,
                                              timezone,
                                              locale,
                                          ),
                                      })
                                    : ''}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500">
                                {reminder.status === 'failed'
                                    ? t('reminder.sendFailed')
                                    : reminder.skipReason
                                      ? t(REASON_KEY[reminder.skipReason])
                                      : ''}
                            </p>
                        </div>

                        {/* The point of the whole banner: one tap to dial. */}
                        <a
                            href={`tel:${reminder.patient.phone}`}
                            dir="ltr"
                            className="flex h-10 items-center rounded-lg bg-amber-600 px-4 font-mono text-sm font-medium text-white shadow-sm transition hover:bg-amber-700"
                        >
                            {reminder.patient.phone}
                        </a>
                        <button
                            type="button"
                            onClick={() => setDismissed((current) => [...current, reminder.id])}
                            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                            {t('common.dismiss')}
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
