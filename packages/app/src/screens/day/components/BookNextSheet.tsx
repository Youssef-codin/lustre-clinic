/**
 * Book the next visit, offered the moment a patient is checked in. Completing a
 * check-in used to go straight to their record, so booking the return meant
 * backing out and starting the booking flow from nothing, with the patient
 * standing there.
 *
 * Asked at check-in rather than at checkout, which is the one thing that decides
 * what this defaults to. At checkout the work has been done and the interval is
 * known, so a sheet there could open on a real date; at check-in nothing has
 * happened yet and there is no clinical fact to date a return from. So nothing
 * is preselected. The strip opens on the first day with room and the time is
 * left blank, because a time nobody chose is an appointment nobody agreed to —
 * the sheet's job is to save the search, not to guess the answer.
 *
 * Dismissing is the common case and has to cost nothing: the scrim, the
 * hardware back and an explicit Not now all land exactly where confirming an
 * arrival landed before this sheet existed. Only a write in flight refuses them.
 *
 * Small on purpose — the day, the time, and confirm. How long, what for, which
 * branch and a note stay on `BookingScreen`; this is not a second way in to
 * them. The patient is carried across rather than searched for again.
 *
 * It is the same `appointment.create` as everywhere else, so the exclusion
 * constraint can still refuse it, and the refusal lands above the button in this
 * sheet (§4/§14) — never a toast that slides away. A refused time is also a time
 * now known to be gone, so the pick is dropped and the fortnight re-read; every
 * other failure leaves the pick alone, so trying again is one tap.
 */
import { ERROR_CODE } from '@lustre/shared';
import { useMemo, useState } from 'react';
import { Button, Callout, Sheet } from '../../../components/ui';
import { dayLabel, fortnightSlots, timeLabel, workingDaysIn } from '../booking';
import { api, type ClinicDay, useLocalMutation, useLocalQuery } from '../data';
import { describeError } from '../errors';
import { isoAt, offsetForDate, todayKey } from '../time';
import { SlotPicker } from './SlotPicker';

/** The same fortnight the booking page offers. */
const STRIP_DAYS = 14;

export type BookNextSheetProps = {
    visible: boolean;
    patientId: string;
    /** Shown instead of a search box — this is the patient who is standing there. */
    patientName: string;
    /** Where they were just checked in, which is where the next visit goes. */
    branchId: string | null;
    branchName: string | null;
    schedule: readonly ClinicDay[] | undefined;
    /** The clinic's default length. This sheet does not ask; `BookingScreen` does. */
    durationMinutes: number;
    nowMinutes: number;
    onDismiss: () => void;
    onBooked: (booked: { dateKey: string; minutes: number }) => void;
};

export function BookNextSheet({
    visible,
    patientId,
    patientName,
    branchId,
    branchName,
    schedule,
    durationMinutes,
    nowMinutes,
    onDismiss,
    onBooked,
}: BookNextSheetProps) {
    const today = todayKey();
    const [date, setDate] = useState<string | null>(null);
    const [slotMinutes, setSlotMinutes] = useState<number | null>(null);

    const create = useLocalMutation(api.create);

    const days = useMemo(
        () => workingDaysIn(today, STRIP_DAYS, schedule, branchId),
        [today, schedule, branchId],
    );

    // Only while the sheet is up: a fortnight is fourteen reads over Tailscale,
    // and most check-ins dismiss this without ever looking at a time.
    const fortnight = useLocalQuery(`book-next-days:${branchId}:${days.join(',')}`, () => api.byDates(days), {
        enabled: visible && days.length > 0,
    });

    // `enabled: false` leaves the query at `success` with no rows, so neither
    // status alone answers "is there anything to draw yet" — holding the rows
    // is. A branch that works on none of the next fortnight's days has nothing
    // to read at all, and must say so rather than read forever.
    const reading = days.length > 0 && fortnight.data === undefined && fortnight.error === null;

    const { slotsByDay, openDays } = useMemo(
        () =>
            fortnightSlots({
                days,
                fetched: fortnight.data,
                schedule,
                branchId,
                durationMinutes,
                today,
                nowMinutes,
            }),
        [days, fortnight.data, schedule, branchId, durationMinutes, today, nowMinutes],
    );

    // Derived rather than stored, so the strip cannot be left pointing at a day
    // that filled up underneath it — the first day with room is the fallback at
    // every render, not something an effect has to notice and correct.
    const day = date !== null && openDays.includes(date) ? date : (openDays[0] ?? null);
    const slots = day === null ? [] : (slotsByDay.get(day) ?? []);

    const chosen = day !== null && slotMinutes !== null ? { day, minutes: slotMinutes } : null;
    const ready = chosen !== null && branchId !== null;
    const failure = create.error ? describeError(create.error, 'book-next') : null;

    function book() {
        if (chosen === null || branchId === null) return;

        create.mutate(
            {
                patient: { kind: 'existing', patientId },
                branchId,
                startsAt: isoAt(chosen.day, chosen.minutes),
                durationMinutes,
                offsetMinutes: offsetForDate(chosen.day),
            },
            {
                onSuccess: () => onBooked({ dateKey: chosen.day, minutes: chosen.minutes }),
                onError: (error) => {
                    // Only an overlap proves the time is gone. The clinic PC not
                    // answering says nothing about the slot, and dropping the
                    // pick would make the desk choose it a second time.
                    if (error.code !== ERROR_CODE.SLOT_OVERLAP) return;
                    setSlotMinutes(null);
                    fortnight.refetch();
                },
            },
        );
    }

    return (
        <Sheet
            visible={visible}
            onClose={onDismiss}
            title="Book their next visit?"
            subtitle={patientName}
            maxHeightRatio={0.8}
            // A booking in flight cannot be dismissed into not knowing whether
            // it landed. Nothing else here refuses to close.
            dismissable={!create.pending}
            testID="book-next-sheet"
            footer={
                <>
                    <Button
                        label={
                            chosen
                                ? `Book ${dayLabel(chosen.day)} at ${timeLabel(chosen.minutes)}`
                                : 'Pick a day and a time'
                        }
                        block
                        loading={create.pending}
                        disabled={!ready}
                        onPress={book}
                        testID="book-next-confirm"
                    />
                    <Button
                        label="Not now"
                        variant="text"
                        block
                        disabled={create.pending}
                        onPress={onDismiss}
                        testID="book-next-dismiss"
                    />
                </>
            }
        >
            {branchId === null ? (
                <Callout tone="warning" title="No branch to book into">
                    Add a branch in Settings before booking a next visit.
                </Callout>
            ) : (
                <SlotPicker
                    dateKey={day ?? today}
                    days={openDays}
                    daysLoading={reading}
                    onPickDate={(key) => {
                        setDate(key);
                        create.reset();
                    }}
                    slotMinutes={slotMinutes}
                    onPickSlot={(minutes) => {
                        setSlotMinutes(minutes);
                        create.reset();
                    }}
                    slots={slots}
                    loading={reading}
                    error={fortnight.error}
                    onRetry={fortnight.refetch}
                    branchName={branchName}
                    // How long is the clinic's default here. The sheet asks the
                    // two questions the desk has an answer to at the door.
                    duration={null}
                />
            )}

            {failure ? (
                <Callout tone="warning" title={failure.title}>
                    {failure.body ?? ''}
                </Callout>
            ) : null}
        </Sheet>
    );
}
