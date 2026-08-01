import type { PatientDetail } from '@mawid/shared';
import { createRoute, useRouter } from '@tanstack/react-router';
import { AppointmentHistory, NextVisitCard, nextVisit } from '../components/AppointmentHistory.tsx';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { useServerEvent } from '../contexts/SocketContext.tsx';
import { api } from '../lib/api.ts';
import { localizeError } from '../lib/errorMessage.ts';
import { rootRoute } from './root.tsx';

/**
 * The page a scanned slip opens on a phone — `/s/:ref` records the scan on the
 * server and redirects here (spec §9). Phone-first: one column, nothing that
 * needs a wide screen, because that is where it is read.
 */
function PatientPage() {
    const detail = patientRoute.useLoaderData();
    const { patientId } = patientRoute.useParams();
    const router = useRouter();
    const { t } = useI18n();

    // The desk may book or move this patient while the doctor is looking at
    // their page — both events carry the patient, so only theirs reloads.
    const refreshIfMine = (payload: { patientId: number }) => {
        if (payload.patientId === patientId) void router.invalidate();
    };
    useServerEvent('appointment:created', refreshIfMine);
    useServerEvent('appointment:updated', refreshIfMine);

    const upcoming = nextVisit(detail.appointments);

    return (
        <>
            <section className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900">{detail.patient.name}</h1>
                {/* Always LTR: an E.164 number reads left-to-right in both locales. */}
                <a
                    href={`tel:${detail.patient.phone}`}
                    dir="ltr"
                    className="mt-1 inline-block font-mono text-slate-600 underline underline-offset-4"
                >
                    {detail.patient.phone}
                </a>

                {detail.patient.notes && (
                    <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
                        <h2 className="text-xs font-medium text-amber-900">{t('patient.notes')}</h2>
                        <p className="mt-0.5 text-sm text-slate-700">{detail.patient.notes}</p>
                    </div>
                )}
            </section>

            {upcoming && <NextVisitCard appointment={upcoming} />}

            <section>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold">{t('patient.history')}</h2>
                    <span className="text-sm text-slate-500">
                        {t('day.count', { count: detail.appointments.length })}
                    </span>
                </div>
                <AppointmentHistory appointments={detail.appointments} />
            </section>
        </>
    );
}

function PatientError({ error }: { error: Error }) {
    const { t } = useI18n();

    return (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {t('patient.loadFailed', { message: localizeError(t, error) })}
        </p>
    );
}

function PatientPending() {
    const { t } = useI18n();
    return <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>;
}

export const patientRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/p/$patientId',
    /*
     * Parsed to a number at the route boundary so it matches the `scan` websocket
     * payload, which carries `patientId` as a number. Without this the desk
     * screen would have to stringify on every navigate.
     */
    params: {
        parse: (raw: { patientId: string }) => ({ patientId: Number(raw.patientId) }),
        stringify: ({ patientId }: { patientId: number }) => ({ patientId: String(patientId) }),
    },
    loader: ({ params }): Promise<PatientDetail> => {
        if (!Number.isInteger(params.patientId)) throw new Error('BAD_PATIENT_ID');
        // Patient *and* history in one payload: this page is opened by scanning
        // a slip on a phone, where a second round trip is the difference between
        // instant and noticeably slow.
        return api.get<PatientDetail>(`/api/patients/${params.patientId}`);
    },
    component: PatientPage,
    errorComponent: PatientError,
    pendingComponent: PatientPending,
});
