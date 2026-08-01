import {
    type AppointmentStatus,
    type AppointmentWithPatient,
    appointmentTypeLabel,
    type DayAppointments,
} from '@mawid/shared';
import { Link } from '@tanstack/react-router';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useI18n } from '../contexts/LocaleContext.tsx';
import type { TranslationKey } from '../i18n/index.ts';
import { formatClinicTime } from '../lib/datetime.ts';

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

function Row({ appointment }: { appointment: AppointmentWithPatient }) {
    const { config } = useConfig();
    const { locale, t } = useI18n();

    const type = config?.appointmentTypes.find((candidate) => candidate.id === appointment.typeId);
    const time = config ? formatClinicTime(appointment.startsAt, config.clinic.timezone, locale) : '';
    const cancelled = appointment.status === 'cancelled';

    return (
        <li className={cancelled ? 'opacity-60' : undefined}>
            <Link
                to="/p/$patientId"
                params={{ patientId: appointment.patient.id }}
                className="flex items-center gap-4 px-4 py-3 transition hover:bg-slate-50"
            >
                <span className="w-14 shrink-0 font-mono text-base tabular-nums text-slate-900">{time}</span>

                <span className="min-w-0 flex-1">
                    <span
                        className={`block truncate font-medium ${cancelled ? 'line-through' : ''} text-slate-900`}
                    >
                        {appointment.patient.name}
                    </span>
                    <span className="block truncate font-mono text-sm text-slate-500" dir="ltr">
                        {appointment.patient.phone}
                    </span>
                </span>

                <span className="shrink-0 text-sm text-slate-600">
                    {type ? appointmentTypeLabel(type, locale) : appointment.typeId}
                </span>

                <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[appointment.status]}`}
                >
                    {t(STATUS_KEY[appointment.status])}
                </span>
            </Link>
        </li>
    );
}

/**
 * The day in time order — the same order the printed schedule uses, because the
 * secretary reads one while looking at the other (spec §7).
 */
export function DayList({ appointments }: { appointments: DayAppointments }) {
    const { t } = useI18n();

    if (appointments.length === 0) {
        return (
            <p className="rounded-lg bg-white px-4 py-8 text-center text-slate-500 shadow-sm">
                {t('day.empty')}
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
