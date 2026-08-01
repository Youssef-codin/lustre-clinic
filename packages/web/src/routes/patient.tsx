import { createRoute } from '@tanstack/react-router';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { rootRoute } from './root.tsx';

/**
 * The page a scanned slip opens on a phone — `/s/:ref` records the scan on the
 * server and redirects here (spec §9). Patient details and appointment history
 * land in build item 8, once the contract for them exists in `@mawid/shared`.
 */
function PatientPage() {
    const { patientId } = patientRoute.useParams();
    const { t } = useI18n();

    if (!Number.isInteger(patientId)) {
        return <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{t('patient.badId')}</p>;
    }

    return (
        <section>
            <h2 className="mb-3 text-lg font-semibold">{t('patient.heading')}</h2>
            <p className="text-slate-500">{t('patient.pending', { id: patientId })}</p>
        </section>
    );
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
    component: PatientPage,
});
