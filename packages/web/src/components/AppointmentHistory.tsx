import { type Appointment, type AppointmentStatus, appointmentTypeLabel } from '@mawid/shared';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useI18n } from '../contexts/LocaleContext.tsx';
import type { TranslationKey } from '../i18n/index.ts';
import { clinicDay, formatClinicDate, formatClinicTime } from '../lib/datetime.ts';

const STATUS_KEY: Record<AppointmentStatus, TranslationKey> = {
    booked: 'appt.booked',
    done: 'appt.done',
    cancelled: 'appt.cancelled',
    no_show: 'appt.no_show',
};

const STATUS_STYLES: Record<AppointmentStatus, string> = {
    booked: 'bg-sky-100 text-sky-800',
    done: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-slate-200 text-slate-600',
    no_show: 'bg-amber-100 text-amber-800',
};

/** The soonest still-booked appointment, or null. The history arrives newest
 *  first, so the earliest upcoming one is the last that matches. */
export function nextVisit(appointments: Appointment[]): Appointment | null {
    const now = Date.now();
    const upcoming = appointments.filter(
        (appointment) => appointment.status === 'booked' && new Date(appointment.startsAt).getTime() >= now,
    );
    return upcoming.at(-1) ?? null;
}

export function useAppointmentLabels(appointment: Appointment) {
    const { config } = useConfig();
    const { locale } = useI18n();

    const timezone = config?.clinic.timezone;
    const type = config?.appointmentTypes.find((candidate) => candidate.id === appointment.typeId);

    return {
        date: timezone ? formatClinicDate(clinicDay(appointment.startsAt, timezone), locale) : '',
        time: timezone ? formatClinicTime(appointment.startsAt, timezone, locale) : '',
        typeLabel: type ? appointmentTypeLabel(type, locale) : appointment.typeId,
    };
}

/** The one thing the doctor is looking for when he scans a slip. */
export function NextVisitCard({ appointment }: { appointment: Appointment }) {
    const { t } = useI18n();
    const { date, time, typeLabel } = useAppointmentLabels(appointment);

    return (
        <section className="mb-6 rounded-lg border border-sky-200 bg-sky-50 p-4">
            <h2 className="mb-1 text-sm font-medium text-sky-900">{t('patient.nextVisit')}</h2>
            <p className="text-lg font-semibold text-slate-900">
                {t('book.when', { date, time, duration: appointment.durationMin })}
            </p>
            <p className="mt-0.5 text-slate-700">{typeLabel}</p>
            {/* The code printed on the slip in the patient's hand. */}
            <p className="mt-2 font-mono text-sm text-slate-500" dir="ltr">
                {appointment.ref}
            </p>
        </section>
    );
}

function Row({ appointment }: { appointment: Appointment }) {
    const { t } = useI18n();
    const { date, time, typeLabel } = useAppointmentLabels(appointment);
    const cancelled = appointment.status === 'cancelled';

    return (
        <li className={`px-4 py-3 ${cancelled ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between gap-3">
                <span className={`font-medium text-slate-900 ${cancelled ? 'line-through' : ''}`}>
                    {date}
                </span>
                <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[appointment.status]}`}
                >
                    {t(STATUS_KEY[appointment.status])}
                </span>
            </div>

            <div className="mt-1 flex items-center gap-3 text-sm text-slate-600">
                <span className="font-mono tabular-nums">{time}</span>
                <span>{typeLabel}</span>
                <span className="ms-auto font-mono text-xs text-slate-400" dir="ltr">
                    {appointment.ref}
                </span>
            </div>

            {appointment.note && <p className="mt-1.5 text-sm text-slate-500">{appointment.note}</p>}
        </li>
    );
}

export function AppointmentHistory({ appointments }: { appointments: Appointment[] }) {
    const { t } = useI18n();

    if (appointments.length === 0) {
        return (
            <p className="rounded-lg bg-white px-4 py-8 text-center text-slate-500 shadow-sm">
                {t('patient.noHistory')}
            </p>
        );
    }

    return (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg bg-white shadow-sm">
            {appointments.map((appointment) => (
                <Row key={appointment.id} appointment={appointment} />
            ))}
        </ul>
    );
}
