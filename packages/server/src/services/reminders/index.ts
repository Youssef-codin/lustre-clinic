import type { ReminderSkipReason, ReminderWithPatient } from '@mawid/shared';
import { and, asc, eq, lte } from 'drizzle-orm';
import { getConfig } from '../../config/index.ts';
import { getDb, type Querier, schema } from '../../db/index.ts';
import { logger } from '../../middleware/logger.ts';
import { nowIso } from '../../util/time.ts';
import { broadcast } from '../../ws/index.ts';
import { getSender } from '../whatsapp/index.ts';
import { reminderTimeFor, withinSendWindow } from './schedule.ts';
import { renderReminder } from './template.ts';

/**
 * The reminder loop. An interval inside the server process, not external cron —
 * Baileys needs a persistent connection, so the process is long-running anyway.
 * See spec §9.
 */

const TICK_MS = 60_000;

/**
 * Overdue by more than this and the batch is treated as a recovery rather than
 * normal operation. In normal running a reminder fires within one tick of its
 * scheduled time; after the PC has been off, everything due is hours late.
 */
const CATCH_UP_AFTER_MS = 15 * 60_000;

/** Normal spacing: seconds apart, and only a few per tick so a batch that all
 *  snapped to the same opening time trickles instead of bursting. */
const NORMAL_GAP_MS = 5_000;
const NORMAL_PER_TICK = 5;

/** Send failures worth another go before the row is called `failed`. */
const MAX_SEND_ATTEMPTS = 3;

/**
 * Read fresh for every decision rather than once per sweep — a catch-up drain
 * runs for hours, and the skip rules are meant to see the time at the moment of
 * each send, not the time the batch was built.
 */
export type Clock = () => Date;
const systemClock: Clock = () => new Date();

let timer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;

/* -------------------------------------------------------------------------
 * Rows
 * ------------------------------------------------------------------------- */

interface DueRow {
    reminderId: number;
    appointmentId: number;
    attempts: number;
    scheduledFor: string;
    startsAt: string;
    appointmentStatus: string;
    patientName: string;
    patientPhone: string;
}

function findDue(now: Date, db: Querier = getDb()): DueRow[] {
    return (
        db
            .select({
                reminderId: schema.reminders.id,
                appointmentId: schema.reminders.appointmentId,
                attempts: schema.reminders.attempts,
                scheduledFor: schema.reminders.scheduledFor,
                startsAt: schema.appointments.startsAt,
                appointmentStatus: schema.appointments.status,
                patientName: schema.patients.name,
                patientPhone: schema.patients.phone,
            })
            .from(schema.reminders)
            .innerJoin(schema.appointments, eq(schema.reminders.appointmentId, schema.appointments.id))
            .innerJoin(schema.patients, eq(schema.appointments.patientId, schema.patients.id))
            .where(
                and(
                    eq(schema.reminders.status, 'pending'),
                    lte(schema.reminders.scheduledFor, now.toISOString()),
                ),
            )
            // Soonest appointment first — those are closest to becoming useless.
            .orderBy(asc(schema.appointments.startsAt))
            .all()
    );
}

/** The contract row, for the endpoint and for every pushed event. */
export function loadReminder(reminderId: number, db: Querier = getDb()): ReminderWithPatient | null {
    const row = db
        .select({ reminder: schema.reminders, appointment: schema.appointments, patient: schema.patients })
        .from(schema.reminders)
        .innerJoin(schema.appointments, eq(schema.reminders.appointmentId, schema.appointments.id))
        .innerJoin(schema.patients, eq(schema.appointments.patientId, schema.patients.id))
        .where(eq(schema.reminders.id, reminderId))
        .get();

    if (!row) return null;

    return {
        id: row.reminder.id,
        appointmentId: row.reminder.appointmentId,
        status: row.reminder.status,
        scheduledFor: row.reminder.scheduledFor,
        sentAt: row.reminder.sentAt,
        error: row.reminder.error,
        skipReason: row.reminder.skipReason,
        attempts: row.reminder.attempts,
        appointmentStartsAt: row.appointment.startsAt,
        patient: { id: row.patient.id, name: row.patient.name, phone: row.patient.phone },
    };
}

function announce(event: 'reminder:sent' | 'reminder:failed' | 'reminder:skipped', id: number): void {
    const row = loadReminder(id);
    if (row) broadcast(event, row);
}

/* -------------------------------------------------------------------------
 * Scheduling — called from the appointment module
 * ------------------------------------------------------------------------- */

/**
 * Created in the same transaction as the appointment. The UNIQUE constraint on
 * `appointment_id` is what guarantees a patient is never messaged twice for the
 * same appointment — that is the database's job, not application logic (§5).
 */
export function createReminderFor(appointmentId: number, startsAt: string, db: Querier): void {
    if (!getConfig().reminders.enabled) return;

    db.insert(schema.reminders)
        .values({
            appointmentId,
            status: 'pending',
            scheduledFor: reminderTimeFor(startsAt, getConfig()),
        })
        .run();
}

/**
 * A moved appointment needs its reminder moved with it — otherwise the message
 * goes out relative to a time the patient is no longer expected. Only touches
 * rows still `pending`: one reminder per appointment, ever, so an already-sent
 * one is left exactly as it is.
 */
export function rescheduleReminderFor(appointmentId: number, startsAt: string, db: Querier): void {
    db.update(schema.reminders)
        .set({ scheduledFor: reminderTimeFor(startsAt, getConfig()) })
        .where(and(eq(schema.reminders.appointmentId, appointmentId), eq(schema.reminders.status, 'pending')))
        .run();
}

/* -------------------------------------------------------------------------
 * Skip rules
 * ------------------------------------------------------------------------- */

type Decision = { action: 'send' } | { action: 'skip'; reason: ReminderSkipReason } | { action: 'wait' };

/**
 * Evaluated **immediately before each send**, never when the queue is built —
 * during a slow catch-up drain a reminder can go stale while it waits. See §9.
 *
 * `cancelled` is checked first even though it is third in the spec's table: a
 * cancelled appointment that has also started should read as cancelled on the
 * desk, because that is the one reason the secretary does *not* need to phone.
 */
export function decide(row: DueRow, now: Date, config = getConfig()): Decision {
    if (row.appointmentStatus === 'cancelled') return { action: 'skip', reason: 'cancelled' };

    const startsAt = Date.parse(row.startsAt);
    // A reminder for an appointment already under way makes the system look broken.
    if (startsAt <= now.getTime()) return { action: 'skip', reason: 'started' };

    const leadMs = config.reminders.minLeadHours * 3_600_000;
    if (startsAt - now.getTime() < leadMs) return { action: 'skip', reason: 'too_late' };

    // Outside the window it stays pending and is retried next tick — not skipped.
    if (!withinSendWindow(now, config)) return { action: 'wait' };

    return { action: 'send' };
}

/* -------------------------------------------------------------------------
 * Outcomes
 * ------------------------------------------------------------------------- */

function markSkipped(row: DueRow, reason: ReminderSkipReason): void {
    getDb()
        .update(schema.reminders)
        .set({ status: 'skipped', skipReason: reason })
        .where(eq(schema.reminders.id, row.reminderId))
        .run();

    logger.warn({ appointmentId: row.appointmentId, reason }, 'reminder skipped — patient needs a call');
    announce('reminder:skipped', row.reminderId);
}

function markSent(row: DueRow): void {
    getDb()
        .update(schema.reminders)
        .set({ status: 'sent', sentAt: nowIso(), attempts: row.attempts + 1, error: null })
        .where(eq(schema.reminders.id, row.reminderId))
        .run();

    logger.info({ appointmentId: row.appointmentId }, 'reminder sent');
    announce('reminder:sent', row.reminderId);
}

function markAttemptFailed(row: DueRow, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = row.attempts + 1;
    const giveUp = attempts >= MAX_SEND_ATTEMPTS;

    getDb()
        .update(schema.reminders)
        .set({ status: giveUp ? 'failed' : 'pending', attempts, error: message })
        .where(eq(schema.reminders.id, row.reminderId))
        .run();

    logger.error({ appointmentId: row.appointmentId, attempts, err: message }, 'reminder send failed');
    if (giveUp) announce('reminder:failed', row.reminderId);
}

/** One reminder, decided and acted on. Returns whether the sweep should go on. */
async function process(row: DueRow, clock: Clock): Promise<'sent' | 'skipped' | 'stop'> {
    const config = getConfig();
    const decision = decide(row, clock(), config);

    if (decision.action === 'skip') {
        markSkipped(row, decision.reason);
        return 'skipped';
    }

    // Outside the send window, or nothing to send with: leave every remaining
    // row pending and try again next tick.
    if (decision.action === 'wait') return 'stop';

    const sender = getSender();
    if (!sender?.status().connected) return 'stop';

    try {
        await sender.send(
            row.patientPhone,
            renderReminder(config.reminders.template, row.patientName, row.startsAt, config),
        );
        markSent(row);
    } catch (err) {
        markAttemptFailed(row, err);
    }

    return 'sent';
}

/* -------------------------------------------------------------------------
 * The sweep
 * ------------------------------------------------------------------------- */

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Randomized 5–15 minute spacing. Fixed intervals look automated; jitter does
 * not — and this is the pattern that gets a WhatsApp number restricted, so it
 * is a requirement rather than a nicety (§8, §9).
 */
function catchUpGap(): number {
    const { minGapMinutes, maxGapMinutes } = getConfig().reminders.catchUp;
    const span = maxGapMinutes - minGapMinutes;
    return (minGapMinutes + Math.random() * span) * 60_000;
}

/**
 * Spacing goes *between* sends, never after the last one and never between two
 * skips — a sweep that sent one message must not sit holding the lock for
 * another gap with nothing to do, and a skip costs the number nothing.
 */
async function drain(rows: DueRow[], clock: Clock, gap: () => number): Promise<void> {
    let previousSent = false;

    for (const row of rows) {
        if (previousSent) await wait(gap());

        const outcome = await process(row, clock);
        if (outcome === 'stop') return;
        previousSent = outcome === 'sent';
    }
}

export async function sweep(clock: Clock = systemClock): Promise<void> {
    if (sweeping) return;
    sweeping = true;

    try {
        const now = clock();
        const due = findDue(now);
        if (due.length === 0) return;

        const oldest = Math.min(...due.map((r) => Date.parse(r.scheduledFor)));
        const isCatchUp = now.getTime() - oldest > CATCH_UP_AFTER_MS;

        if (!isCatchUp) {
            // A few, seconds apart. Anything past the per-tick limit waits for
            // the next tick rather than being skipped — nobody goes uncalled
            // just because several reminders came due together.
            await drain(due.slice(0, NORMAL_PER_TICK), clock, () => NORMAL_GAP_MS);
            return;
        }

        const { maxMessages } = getConfig().reminders.catchUp;
        logger.warn({ due: due.length, cap: maxMessages }, 'reminder catch-up sweep');

        // Beyond the cap, stop queueing and surface the rest for the secretary
        // to phone. A ten-hour trickle is not a recovery; a phone call is (§9).
        for (const row of due.slice(maxMessages)) markSkipped(row, 'catch_up_cap');

        await drain(due.slice(0, maxMessages), clock, catchUpGap);
    } finally {
        sweeping = false;
    }
}

export function startReminders(): void {
    if (!getConfig().reminders.enabled) {
        logger.info('reminders are disabled by config');
        return;
    }

    timer = setInterval(
        () => void sweep().catch((err) => logger.error({ err }, 'reminder sweep failed')),
        TICK_MS,
    );
    timer.unref?.();
    logger.info({ everyMs: TICK_MS }, 'reminder loop started');
}

export function stopReminders(): void {
    if (timer) clearInterval(timer);
    timer = null;
}
