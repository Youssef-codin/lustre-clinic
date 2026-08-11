/**
 * There is no renderer under `bun test`, so what is tested here is the part of
 * the screen that is not React: which day is closed, where a block lands, and —
 * the one that matters — what the secretary is told when Postgres refuses a
 * double booking.
 */
import { describe, expect, it } from 'bun:test';
import { type AppointmentStatus, ERROR_CODE, type Tooth } from '@mawid/shared';
import { splitDay } from './agenda';
import { firstFreeSlot, type Slot, slotIsFree, slotsFor } from './booking';
import { slotProgress, splitDeskDay, splitDoctorDay } from './chair';
import { RequestError } from './data/client';
import type { Appointment } from './data/types';
import { describeError } from './errors';
import { hoursFor, isClosed, openMinutes } from './hours';
import { amountDue, formatMoney, poundsEntry } from './money';
import { busiestBranch, loadsFrom } from './month';
import {
    describeProcedure,
    groupByTooth,
    type PlannedProcedure,
    primaryTypeId,
    QUADRANTS,
    toothPosition,
    totalOf,
} from './procedures';
import {
    addDays,
    clock12,
    clockToMinutes,
    dateKey,
    formatDatePill,
    isoAt,
    minutesOfDay,
    minutesToClock,
    relativeDayLabel,
} from './time';

const FRIDAY = '2026-08-07';
const SATURDAY = '2026-08-08';

describe('clinic hours', () => {
    it('falls back to the defaults when the clinic has never set a schedule', () => {
        expect(hoursFor(SATURDAY, undefined)).toEqual({ opens: 600, closes: 1320 });
        expect(hoursFor(SATURDAY, [])).toEqual({ opens: 600, closes: 1320 });
    });

    it('closes the default rest day', () => {
        expect(isClosed(FRIDAY, undefined)).toBe(true);
        expect(openMinutes(FRIDAY, undefined)).toBe(0);
    });

    it('lets a saved schedule win, and a missing weekday means closed', () => {
        const schedule = [{ weekday: 5, branchId: 'b', opensAt: '09:00', closesAt: '13:00' }];

        expect(hoursFor(FRIDAY, schedule)).toEqual({ opens: 540, closes: 780 });
        expect(isClosed(SATURDAY, schedule)).toBe(true);
    });
});

describe('the agenda', () => {
    const at = (id: string, time: string, status: AppointmentStatus): Appointment =>
        ({
            id,
            startsAt: `2026-08-10T${time}:00+03:00`,
            status,
            durationMinutes: 30,
            patient: { id: `p-${id}`, name: id, phone: '' },
        }) as Appointment;

    it('folds away what is settled and keeps what still needs doing', () => {
        const { past, upcoming } = splitDay(
            [
                at('done', '09:30', 'done'),
                at('missed', '10:00', 'no_show'),
                at('stale', '10:45', 'booked'),
                at('later', '13:00', 'booked'),
            ],
            null,
        );

        expect(past.map((row) => row.id)).toEqual(['done', 'missed']);
        expect(upcoming.map((row) => row.id)).toEqual(['stale', 'later']);
    });

    it('does not draw the patient in the chair twice', () => {
        const { upcoming } = splitDay(
            [at('chair', '11:00', 'checked_in'), at('next', '11:30', 'booked')],
            'chair',
        );
        expect(upcoming.map((row) => row.id)).toEqual(['next']);
    });

    it('puts the day in order whatever order it arrived in', () => {
        const { upcoming } = splitDay([at('b', '13:00', 'booked'), at('a', '09:00', 'booked')], null);
        expect(upcoming.map((row) => row.id)).toEqual(['a', 'b']);
    });
});

describe("the doctor's day", () => {
    const at = (id: string, time: string, status: AppointmentStatus, updatedAt = time): Appointment =>
        ({
            id,
            startsAt: `2026-08-10T${time}:00+03:00`,
            updatedAt: `2026-08-10T${updatedAt}:00+03:00`,
            status,
            durationMinutes: 30,
            patient: { id: `p-${id}`, name: id, phone: '' },
        }) as Appointment;

    const arrivals = (pairs: Record<string, string>) =>
        new Map(Object.entries(pairs).map(([id, time]) => [id, `2026-08-10T${time}:00+03:00`]));

    it('seats whoever checked in first and leaves the rest waiting', () => {
        const day = splitDoctorDay(
            [at('second', '11:35', 'checked_in'), at('first', '11:05', 'checked_in')],
            arrivals({ first: '11:02', second: '11:20' }),
        );

        expect(day.chair?.id).toBe('first');
        expect(day.waiting.map((row) => row.id)).toEqual(['second']);
    });

    it('gives the card to the patient waiting and the strip to the chair', () => {
        const day = splitDoctorDay(
            [
                at('chair', '11:05', 'checked_in'),
                at('waiting', '11:35', 'checked_in'),
                at('booked', '12:00', 'booked'),
            ],
            arrivals({ chair: '11:02', waiting: '11:20' }),
        );

        expect(day.headline?.id).toBe('waiting');
        expect(day.strip?.id).toBe('chair');
        expect(day.list.map((row) => row.id)).toEqual(['booked']);
    });

    it('puts the next slot on the card while the chair keeps the strip', () => {
        const day = splitDoctorDay(
            [at('chair', '11:05', 'checked_in'), at('booked', '12:00', 'booked')],
            arrivals({ chair: '11:02' }),
        );

        expect(day.headline?.id).toBe('booked');
        expect(day.strip?.id).toBe('chair');
        expect(day.list).toEqual([]);
    });

    it('hands the card back to the chair when there is nothing after it', () => {
        const day = splitDoctorDay([at('chair', '11:05', 'checked_in')], arrivals({ chair: '11:02' }));

        expect(day.headline?.id).toBe('chair');
        expect(day.strip).toBeNull();
    });

    it('orders the queue by updatedAt when the visits are not to hand', () => {
        const day = splitDoctorDay([
            at('late', '11:05', 'checked_in', '11:30'),
            at('early', '11:35', 'checked_in', '11:10'),
        ]);

        expect(day.chair?.id).toBe('early');
    });

    it('folds a patient sent to the desk away with the rest of the history', () => {
        const day = splitDoctorDay([
            at('paid', '09:30', 'done'),
            at('desk', '10:00', 'awaiting_payment'),
            at('booked', '12:00', 'booked'),
        ]);

        expect(day.past.map((row) => row.id)).toEqual(['paid', 'desk']);
        expect(day.list).toEqual([]);
        expect(day.headline?.id).toBe('booked');
    });

    it('seats the same patient the desk does', () => {
        const rows = [at('second', '11:35', 'checked_in'), at('first', '11:05', 'checked_in')];
        const when = arrivals({ first: '11:02', second: '11:20' });

        expect(splitDeskDay(rows, when).chair?.id).toBe(splitDoctorDay(rows, when).chair?.id);
    });

    it('holds the desk card on the patient who still owes, and seats the next', () => {
        const day = splitDeskDay(
            [
                at('desk', '11:05', 'awaiting_payment', '11:40'),
                at('waiting', '11:35', 'checked_in'),
                at('booked', '12:00', 'booked'),
            ],
            arrivals({ waiting: '11:20' }),
        );

        expect(day.card?.id).toBe('desk');
        expect(day.chair?.id).toBe('waiting');
    });

    it('falls back to the chair, then to the next booking, for the card', () => {
        const seated = [at('chair', '11:05', 'checked_in'), at('booked', '12:00', 'booked')];

        expect(splitDeskDay(seated, arrivals({ chair: '11:02' })).card?.id).toBe('chair');
        expect(splitDeskDay([at('booked', '12:00', 'booked')]).card?.id).toBe('booked');
        expect(splitDeskDay([at('paid', '09:30', 'done')]).card).toBeNull();
    });

    it('measures the slot, and says so once it runs over', () => {
        const appointment = at('chair', '11:00', 'checked_in');
        const start = minutesOfDay(appointment.startsAt);

        expect(slotProgress(appointment, start + 15).label).toBe('15 / 30 min');
        expect(slotProgress(appointment, start + 45).over).toBe(true);
        expect(slotProgress(appointment, start + 45).label).toBe('15 min over');
    });
});

describe('the month', () => {
    const at = (id: string, branchId: string, status: AppointmentStatus = 'booked'): Appointment =>
        ({
            id,
            branchId,
            startsAt: `2026-08-10T11:00:00+03:00`,
            status,
            durationMinutes: 30,
            patient: { id: `p-${id}`, name: id, phone: '' },
        }) as Appointment;

    it('sends the day to the branch holding most of it', () => {
        const rows = [at('a', 'maadi'), at('b', 'zamalek'), at('c', 'zamalek')];
        expect(busiestBranch(rows, 'maadi')).toBe('zamalek');
    });

    it('stays where it is when the day is split evenly', () => {
        const rows = [at('a', 'zamalek'), at('b', 'maadi')];
        expect(busiestBranch(rows, 'maadi')).toBe('maadi');
        expect(busiestBranch(rows, 'zamalek')).toBe('zamalek');
    });

    it('moves nothing on a day with nothing booked', () => {
        expect(busiestBranch([], 'maadi')).toBe(null);
    });

    it('counts every branch, and lets no cancellation pull the pick', () => {
        const loads = loadsFrom(
            [SATURDAY],
            [[at('a', 'maadi'), at('b', 'zamalek'), at('c', 'zamalek', 'cancelled')]],
            undefined,
            'maadi',
        );

        expect(loads.get(SATURDAY)?.count).toBe(2);
        expect(loads.get(SATURDAY)?.busiest).toBe('maadi');
    });

    it('leaves a closed day at no load rather than dividing by nothing', () => {
        const loads = loadsFrom([FRIDAY], [[at('a', 'maadi')]], undefined, 'maadi');
        expect(loads.get(FRIDAY)?.fill).toBe(0);
        expect(loads.get(FRIDAY)?.slots).toBe(0);
    });
});

describe('errors', () => {
    it('says the slot is taken, and says what to do about it', () => {
        const overlap = new RequestError(ERROR_CODE.SLOT_OVERLAP, 'that slot overlaps another appointment');

        const walkIn = describeError(overlap, 'walk-in');
        expect(walkIn.title).toBe('That slot is taken');
        expect(walkIn.body).toContain('shorter visit');

        expect(describeError(overlap, 'move').title).toBe('That slot is taken');
    });

    it('names the clinic server when the request never arrived', () => {
        const offline = new RequestError(ERROR_CODE.INTERNAL, 'fetch failed', { offline: true });
        expect(describeError(offline, 'check-in').body).toContain('Nothing was saved');
    });
});

describe('money', () => {
    it('formats piastres as whole pounds, grouped', () => {
        expect(formatMoney(260_000)).toBe('EGP 2,600');
        expect(formatMoney(260_000, 'trail')).toBe('2,600 EGP');
        expect(formatMoney(0)).toBe('EGP 0');
    });

    it('takes what has already been paid off the amount due', () => {
        expect(amountDue(260_000, 100_000)).toBe(160_000);
        expect(amountDue(260_000, 0)).toBe(260_000);
        expect(amountDue(50_000, 100_000)).toBe(0);
    });

    it('strips an amount where it is typed, not where it is parsed', () => {
        expect(poundsEntry('12.5')).toBe('125');
        expect(poundsEntry('1,200')).toBe('1200');
    });
});

describe('dates', () => {
    it('speaks in the days the secretary uses', () => {
        const today = dateKey(new Date());
        expect(relativeDayLabel(today, today)).toBe('Today');
        expect(relativeDayLabel(addDays(today, 1), today)).toBe('Tomorrow');
        expect(relativeDayLabel(addDays(today, -1), today)).toBe('Yesterday');
    });

    it('round-trips a clock through minutes', () => {
        expect(clockToMinutes('09:05')).toBe(545);
        expect(minutesToClock(545)).toBe('09:05');
    });

    it('splits the twelve-hour clock from its meridiem, and never says 0:15', () => {
        expect(clock12(11 * 60 + 35)).toEqual({ time: '11:35', meridiem: 'AM' });
        expect(clock12(13 * 60)).toEqual({ time: '1:00', meridiem: 'PM' });
        expect(clock12(0)).toEqual({ time: '12:00', meridiem: 'AM' });
        expect(clock12(12 * 60)).toEqual({ time: '12:00', meridiem: 'PM' });
    });

    it('names the weekday in the header pill only when the day is not today', () => {
        const today = dateKey(new Date());
        expect(formatDatePill(today, today).split(' ')).toHaveLength(2);
        expect(formatDatePill(addDays(today, 2), today).split(' ')).toHaveLength(3);
        expect(formatDatePill(today, today)).toBe(formatDatePill(today, today).toUpperCase());
    });
});

describe('booking slots', () => {
    const SCHEDULE = [{ weekday: 1, branchId: 'b', opensAt: '10:00', closesAt: '12:00' }];
    const MONDAY = '2026-08-10';

    // `isoAt` rather than a hand-written `+03:00`: `bun test` runs in UTC, and a
    // fixed offset would put 10:30 Cairo outside the clinic's morning there.
    const booked = (minutes: number, durationMinutes: number, status: AppointmentStatus): Appointment =>
        ({
            id: String(minutes),
            startsAt: isoAt(MONDAY, minutes),
            durationMinutes,
            status,
            branchId: 'b',
        }) as Appointment;

    const at = (slots: readonly Slot[], minutes: number) => slots.find((slot) => slot.minutes === minutes);

    it('steps the quarter hour from opening to closing', () => {
        const slots = slotsFor({
            dateKey: MONDAY,
            schedule: SCHEDULE,
            appointments: [],
            durationMinutes: 30,
            nowMinutes: null,
        });

        expect(slots).toHaveLength(8);
        expect(slots[0]?.minutes).toBe(600);
        expect(slots.at(-1)?.minutes).toBe(705);
        expect(slots.every((slot) => slot.state === 'free')).toBe(true);
    });

    it('offers a slot the visit would overrun closing on, and says so', () => {
        const slots = slotsFor({
            dateKey: MONDAY,
            schedule: SCHEDULE,
            appointments: [],
            durationMinutes: 45,
            nowMinutes: null,
        });

        expect(at(slots, 690)?.runsLate).toBe(true);
        expect(at(slots, 675)?.runsLate).toBe(false);
        expect(at(slots, 690)?.state).toBe('free');
    });

    it('takes every slot a booking overlaps, at either end', () => {
        const slots = slotsFor({
            dateKey: MONDAY,
            schedule: SCHEDULE,
            appointments: [booked(630, 30, 'booked')],
            durationMinutes: 30,
            nowMinutes: null,
        });

        // A 30-minute visit at 10:15 or 11:00 runs into 10:30–11:00.
        expect(at(slots, 615)?.state).toBe('taken');
        expect(at(slots, 630)?.state).toBe('taken');
        expect(at(slots, 645)?.state).toBe('taken');
        expect(at(slots, 600)?.state).toBe('free');
        expect(at(slots, 660)?.state).toBe('free');
    });

    it('frees the time a cancellation or a no-show was holding', () => {
        const slots = slotsFor({
            dateKey: MONDAY,
            schedule: SCHEDULE,
            appointments: [booked(630, 30, 'cancelled'), booked(660, 30, 'no_show')],
            durationMinutes: 15,
            nowMinutes: null,
        });

        expect(slots.every((slot) => slot.state === 'free')).toBe(true);
    });

    it('does not offer a time today that has already gone by', () => {
        const slots = slotsFor({
            dateKey: MONDAY,
            schedule: SCHEDULE,
            appointments: [],
            durationMinutes: 30,
            nowMinutes: 11 * 60,
        });

        expect(at(slots, 645)?.state).toBe('past');
        expect(at(slots, 660)?.state).toBe('free');
        expect(firstFreeSlot(slots)).toBe(660);
    });

    it('has no times at all on a closed day', () => {
        expect(
            slotsFor({
                dateKey: FRIDAY,
                schedule: undefined,
                appointments: [],
                durationMinutes: 30,
                nowMinutes: null,
            }),
        ).toEqual([]);
    });

    it('refuses a time that stopped being free while the sheet was open', () => {
        const slots = slotsFor({
            dateKey: MONDAY,
            schedule: SCHEDULE,
            appointments: [booked(630, 30, 'booked')],
            durationMinutes: 30,
            nowMinutes: null,
        });

        expect(slotIsFree(slots, 600)).toBe(true);
        expect(slotIsFree(slots, 630)).toBe(false);
        expect(slotIsFree(slots, null)).toBe(false);
    });
});

describe('the procedure plan', () => {
    const line = (id: string, tooth: Tooth | null, price: number): PlannedProcedure => ({
        id,
        procedureId: `proc-${id}`,
        name: 'Composite filling',
        variant: 'Class II',
        tooth,
        price,
    });

    it('groups by tooth, in the order a chart is read, with no tooth last', () => {
        const groups = groupByTooth([
            line('a', 'LL4', 700_00),
            line('b', null, 400_00),
            line('c', 'UL6', 900_00),
            line('d', 'LL4', 300_00),
        ]);

        expect(groups.map((group) => group.tooth)).toEqual(['UL6', 'LL4', null]);
        expect(groups[1]?.items.map((item) => item.id)).toEqual(['a', 'd']);
        expect(groups[1]?.subtotal).toBe(1000_00);
    });

    it('names where a tooth is, and says so when there is none', () => {
        expect(toothPosition('UL6')).toBe('Upper left · 6');
        expect(toothPosition('LRE')).toBe('Lower right · E');
        expect(toothPosition(null)).toBe('No tooth assigned');
    });

    it('offers the child teeth after the permanent ones in every quadrant', () => {
        const upperRight = QUADRANTS.find((quadrant) => quadrant.key === 'UR');

        // Upper right counts towards the midline, so it starts at the wisdom tooth.
        expect(upperRight?.codes[0]).toBe('UR8');
        expect(upperRight?.codes[7]).toBe('UR1');
        expect(upperRight?.codes.slice(8)).toEqual(['URA', 'URB', 'URC', 'URD', 'URE']);
    });

    it('totals the plan and hands the appointment the first line it can carry', () => {
        const plan = [line('a', 'UL6', 900_00), line('b', null, 400_00)];

        expect(totalOf(plan)).toBe(1300_00);
        expect(primaryTypeId(plan)).toBe('proc-a');
        expect(primaryTypeId([])).toBeNull();
    });

    it('reads a line back the way the note and the summary print it', () => {
        expect(describeProcedure(line('a', 'UL6', 0))).toBe('Composite filling · Class II (UL6)');
        expect(describeProcedure({ ...line('b', null, 0), variant: null })).toBe('Composite filling');
    });
});
