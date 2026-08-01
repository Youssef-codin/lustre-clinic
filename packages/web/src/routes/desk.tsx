import type { IsoDate, OpenSlot, PublicConfig } from '@mawid/shared';
import { createRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { BookingSheet } from '../components/BookingSheet.tsx';
import { DateNav } from '../components/DateNav.tsx';
import { DayList } from '../components/DayList.tsx';
import { SlotPanel } from '../components/SlotPanel.tsx';
import { SystemStatus } from '../components/SystemStatus.tsx';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { useDayAppointments } from '../hooks/useDayAppointments.ts';
import { useSlots } from '../hooks/useSlots.ts';
import { todayInClinic, weekdayOf } from '../lib/datetime.ts';
import { localizeError } from '../lib/errorMessage.ts';
import { rootRoute } from './root.tsx';

interface BoardProps {
    config: PublicConfig;
    date: IsoDate;
    typeId: string;
    onDateChange: (date: IsoDate) => void;
    onTypeChange: (typeId: string) => void;
}

function Board({ config, date, typeId, onDateChange, onTypeChange }: BoardProps) {
    const { t } = useI18n();
    const day = useDayAppointments(date);
    const slots = useSlots(date, typeId);
    const [picked, setPicked] = useState<OpenSlot | null>(null);

    const closed = (config.hours[weekdayOf(date)] ?? []).length === 0;

    return (
        <>
            <DateNav date={date} onChange={onDateChange} />

            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
                <section>
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                        <h2 className="text-lg font-semibold">{t('day.heading')}</h2>
                        {day.appointments && (
                            <span className="text-sm text-slate-500">
                                {t('day.count', { count: day.appointments.length })}
                            </span>
                        )}
                    </div>

                    {closed && (
                        <p className="mb-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
                            {t('day.closed')}
                        </p>
                    )}

                    {day.error != null && (
                        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {t('day.loadFailed', { message: localizeError(t, day.error) })}
                        </p>
                    )}

                    {day.error == null && day.appointments && <DayList appointments={day.appointments} />}
                </section>

                <SlotPanel
                    typeId={typeId}
                    onTypeChange={onTypeChange}
                    slots={slots.slots}
                    loading={slots.loading}
                    error={slots.error}
                    onPick={setPicked}
                />
            </div>

            {picked && slots.slots && (
                <BookingSheet
                    date={date}
                    slot={picked}
                    typeId={typeId}
                    durationMin={slots.slots.durationMin}
                    onClose={() => setPicked(null)}
                    onBooked={() => {
                        setPicked(null);
                        // Both change: the day gains a row, the slot stops being open.
                        day.reload();
                        slots.reload();
                    }}
                />
            )}
        </>
    );
}

/** The secretary's screen: the day on one side, booking on the other. */
function DeskScreen() {
    const { config } = useConfig();
    const { t } = useI18n();
    const [date, setDate] = useState<IsoDate | null>(null);
    const [typeId, setTypeId] = useState<string | null>(null);

    // "Today" and the default type are both clinic settings, so neither can be
    // decided before /api/config has answered.
    useEffect(() => {
        if (!config) return;
        setDate((current) => current ?? todayInClinic(config.clinic.timezone));
        setTypeId((current) => current ?? config.appointmentTypes[0]?.id ?? null);
    }, [config]);

    return (
        <>
            <SystemStatus />
            {config && date && typeId ? (
                <Board
                    config={config}
                    date={date}
                    typeId={typeId}
                    onDateChange={setDate}
                    onTypeChange={setTypeId}
                />
            ) : (
                <p className="py-8 text-center text-slate-500">{t('book.searching')}</p>
            )}
        </>
    );
}

export const deskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: DeskScreen,
});
