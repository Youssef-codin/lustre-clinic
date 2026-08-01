import {
    type DayAppointments,
    type IsoDate,
    isoDateSchema,
    type OpenSlot,
    type PrintFailuresResponse,
    type PublicConfig,
    type SlotsResponse,
} from '@mawid/shared';
import { createRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { BookingSheet } from '../components/BookingSheet.tsx';
import { DateNav } from '../components/DateNav.tsx';
import { DayList } from '../components/DayList.tsx';
import { PrintFailureBanner } from '../components/PrintFailureBanner.tsx';
import { SlotPanel } from '../components/SlotPanel.tsx';
import { SystemStatus } from '../components/SystemStatus.tsx';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { useScan } from '../contexts/ScanContext.tsx';
import { useServerEvent } from '../contexts/SocketContext.tsx';
import { api } from '../lib/api.ts';
import { loadConfig } from '../lib/config.ts';
import { todayInClinic, weekdayOf } from '../lib/datetime.ts';
import { localizeError } from '../lib/errorMessage.ts';
import { rootRoute } from './root.tsx';

/**
 * The day and the appointment type live in the URL, not in component state:
 * the loader needs them to fetch, and it makes a particular day linkable — the
 * secretary can keep a tab on tomorrow.
 *
 * Both are optional. Their defaults are clinic settings ("today" in the clinic's
 * timezone, the first configured type), so they are resolved in the loader once
 * config has answered rather than baked into a redirect.
 */
interface DeskSearch {
    date?: IsoDate;
    typeId?: string;
}

interface DeskData {
    config: PublicConfig;
    date: IsoDate;
    typeId: string;
    appointments: DayAppointments;
    slots: SlotsResponse;
    printFailures: PrintFailuresResponse;
}

function DeskScreen() {
    const { config, date, typeId, appointments, slots, printFailures } = deskRoute.useLoaderData();
    const navigate = deskRoute.useNavigate();
    const router = useRouter();
    const { t } = useI18n();
    const scan = useScan();
    const [picked, setPicked] = useState<OpenSlot | null>(null);

    /*
     * Another desk booked, moved or cancelled something. Invalidate rather than
     * testing the event's day against this one: a moved appointment leaves the
     * day it used to be on, and its new `startsAt` says nothing about the day it
     * just vanished from.
     */
    const refresh = () => {
        void router.invalidate();
    };
    useServerEvent('appointment:created', refresh);
    useServerEvent('appointment:updated', refresh);

    // `replace`, so a morning of clicking through days leaves one history entry
    // rather than thirty for the back button to chew through.
    const setSearch = (next: DeskSearch) => {
        void navigate({ search: (prev: DeskSearch) => ({ ...prev, ...next }), replace: true });
    };

    const closeSheet = () => {
        setPicked(null);
        scan.endEdit();
    };

    const closed = (config.hours[weekdayOf(date)] ?? []).length === 0;

    return (
        <>
            <SystemStatus />
            <PrintFailureBanner fetched={printFailures} />
            <DateNav date={date} onChange={(next) => setSearch({ date: next })} />

            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
                <section>
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                        <h2 className="text-lg font-semibold">{t('day.heading')}</h2>
                        <span className="text-sm text-slate-500">
                            {t('day.count', { count: appointments.length })}
                        </span>
                    </div>

                    {closed && (
                        <p className="mb-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
                            {t('day.closed')}
                        </p>
                    )}

                    <DayList appointments={appointments} />
                </section>

                <SlotPanel
                    typeId={typeId}
                    onTypeChange={(next) => setSearch({ typeId: next })}
                    slots={slots}
                    onPick={(slot) => {
                        // Un-saved input from here on — a scan must not yank it away.
                        setPicked(slot);
                        scan.beginEdit();
                    }}
                />
            </div>

            {picked && (
                <BookingSheet
                    date={date}
                    slot={picked}
                    typeId={typeId}
                    durationMin={slots.durationMin}
                    onClose={closeSheet}
                    onBooked={() => {
                        closeSheet();
                        // The day gains a row and the slot stops being open.
                        refresh();
                    }}
                />
            )}
        </>
    );
}

function DeskError({ error }: { error: Error }) {
    const { t } = useI18n();

    return (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {t('day.loadFailed', { message: localizeError(t, error) })}
        </p>
    );
}

function DeskPending() {
    const { t } = useI18n();
    return <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>;
}

export const deskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (search: Record<string, unknown>): DeskSearch => ({
        // A bad value in a hand-edited URL falls back to the default rather
        // than throwing the secretary onto an error screen.
        date: isoDateSchema.safeParse(search.date).success ? (search.date as IsoDate) : undefined,
        typeId: typeof search.typeId === 'string' && search.typeId !== '' ? search.typeId : undefined,
    }),
    loaderDeps: ({ search }: { search: DeskSearch }) => ({ date: search.date, typeId: search.typeId }),
    loader: async ({ deps }): Promise<DeskData> => {
        const config = await loadConfig();
        const date = deps.date ?? todayInClinic(config.clinic.timezone);
        const typeId = deps.typeId ?? config.appointmentTypes[0]?.id;

        if (!typeId) throw new Error('config.appointmentTypes is empty');

        // One round trip each, in parallel — the desk screen is the one the
        // secretary waits on with a patient standing in front of her.
        const [appointments, slots, printFailures] = await Promise.all([
            api.get<DayAppointments>(`/api/appointments?date=${date}`),
            api.get<SlotsResponse>(`/api/slots?date=${date}&typeId=${encodeURIComponent(typeId)}`),
            // Never fatal: a broken failures endpoint must not take the whole
            // booking screen down with it.
            api.get<PrintFailuresResponse>('/api/print/failures').catch(() => []),
        ]);

        return { config, date, typeId, appointments, slots, printFailures };
    },
    component: DeskScreen,
    errorComponent: DeskError,
    pendingComponent: DeskPending,
});
