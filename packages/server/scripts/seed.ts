/**
 * Fills the configured database with demo data that exercises every screen.
 *
 * Appointments are booked through `createAppointment` rather than inserted
 * directly, so the seed cannot produce data the app itself would reject: refs
 * are allocated by the real sequence, working hours and the overlap rule are
 * enforced, and every appointment gets its reminder row. Times come from
 * `findOpenSlots`, so a config edit changing the clinic's hours changes what
 * the seed books instead of breaking it.
 *
 * Printing is forced to the `none` driver for the run — seeding forty
 * appointments should not spool forty slips at whoever runs it.
 *
 *   bun run seed              # refuses if the database already has patients
 *   bun run seed --reset      # deletes every patient, appointment and reminder first
 */
import { eq, sql } from 'drizzle-orm';
import { loadConfig, setConfig } from '../src/config/index.ts';
import { closeDb, getDb, openDb, schema } from '../src/db/index.ts';
import { createAppointment } from '../src/modules/appointment/appointment.service.ts';
import { findOpenSlots } from '../src/modules/slots/slots.service.ts';
import { startPrinter } from '../src/services/printer/index.ts';
import { addDays, clinicDate, nowIso } from '../src/util/time.ts';

const RESET = process.argv.includes('--reset');

/**
 * Real-looking Egyptian mobiles in the four live prefixes, written the way a
 * secretary types them off a paper book — the server normalizes to E.164 on
 * write, so the seed exercises that path rather than sidestepping it.
 */
const PEOPLE = [
    { name: 'سارة محمود', phone: '01012345678' },
    { name: 'أحمد عبد الرحمن', phone: '01198765432' },
    { name: 'منى إبراهيم', phone: '01234567890' },
    { name: 'خالد فاروق', phone: '01555443322' },
    { name: 'نورهان سيد', phone: '01066778899' },
    { name: 'مصطفى الشناوي', phone: '01122334455' },
    { name: 'ياسمين حسن', phone: '01277889900' },
    { name: 'عمر الديب', phone: '01599887766' },
] as const;

/**
 * Every configured type gets used, weighted the way a real week looks: mostly
 * check-ups and cleanings, the occasional root canal. Keeping `other` in the
 * rotation matters — it is the one with no clinical meaning and it is the one
 * most likely to be missing a label somewhere in the UI.
 */
const TYPE_ROTATION = [
    'checkup',
    'cleaning',
    'checkup',
    'filling',
    'rootcanal',
    'checkup',
    'extraction',
    'cleaning',
    'other',
    'checkup',
] as const;

interface Booked {
    id: number;
    patientId: number;
    startsAt: string;
    daysFromToday: number;
}

function wipe(): void {
    const db = getDb();
    // Children first — both tables carry a foreign key onto the one below it.
    db.delete(schema.reminders).run();
    db.delete(schema.appointments).run();
    db.delete(schema.patients).run();
    console.log('cleared existing patients, appointments and reminders');
}

function patientCount(): number {
    const row = getDb().select({ n: sql<number>`count(*)` }).from(schema.patients).get();
    return row?.n ?? 0;
}

/**
 * Books one appointment on `date`, choosing the `nth` still-open slot of that
 * day. Returns null when the clinic is closed or the day has filled up, which
 * is normal — Fridays are closed in the example config and the seed simply
 * moves on rather than treating it as an error.
 */
function bookNth(date: string, typeId: string, nth: number, patientId: number): Booked | null {
    const open = findOpenSlots(date as never, typeId);
    const slot = open.slots[nth];
    if (!slot) return null;

    const appointment = createAppointment({
        patientId,
        startsAt: slot.startsAt,
        typeId,
        // A note on some but not all of them: the desk renders the row
        // differently when one is present.
        note: nth % 3 === 0 ? 'متابعة' : undefined,
        // Not every booking comes from the desk; the channel column exists to
        // be seen with more than one value in it.
        channel: nth % 4 === 0 ? 'phone' : 'desk',
    } as never);

    return {
        id: appointment.id,
        patientId,
        startsAt: appointment.startsAt,
        daysFromToday: 0,
    };
}

function main(): void {
    // `setConfig`, not just `loadConfig`: the services below reach for the
    // installed config through `getConfig()`, exactly as they do under the
    // server. `migrate.ts` gets away with the bare load because it only ever
    // touches the returned value.
    const config = setConfig(loadConfig());
    openDb(config.database);

    if (patientCount() > 0) {
        if (!RESET) {
            console.error(
                'database already has patients — refusing to seed on top of it.\n' +
                    'Re-run with --reset to delete everything first, or point MAWID_CONFIG at an empty database.',
            );
            closeDb();
            process.exit(1);
        }
        wipe();
    }

    // `none` for the duration of the seed: the queue would otherwise render a
    // slip per booking. Awaiting is not needed — the none driver has no I/O.
    void startPrinter({ ...config, printing: { ...config.printing, driver: 'none' } });

    const db = getDb();
    const now = nowIso();
    const timezone = config.clinic.timezone;
    const today = clinicDate(now, timezone);

    const patients = PEOPLE.map((person) =>
        db
            .insert(schema.patients)
            .values({
                name: person.name,
                phone: `+20${person.phone.replace(/^0/, '')}`,
                notes: null,
                createdAt: now,
            })
            .returning()
            .get(),
    );
    console.log(`created ${patients.length} patients`);

    /*
     * Three weeks behind and two ahead. The past is what makes the patient page
     * worth opening — a history of one row proves nothing — and the future is
     * what the day view and the reminder panel are for.
     */
    const booked: Booked[] = [];
    let rotation = 0;

    for (let offset = -21; offset <= 14; offset++) {
        const date = addDays(today as never, offset);
        // Two or three a day, so days differ from each other and the day view
        // has something to sort.
        const perDay = offset % 3 === 0 ? 3 : 2;

        for (let n = 0; n < perDay; n++) {
            const typeId = TYPE_ROTATION[rotation % TYPE_ROTATION.length] as string;
            // Deliberately uneven: a few patients should own a thick history
            // and the rest a thin one, because that is what a real book looks
            // like and it is the case the patient page has to render well.
            const patient = patients[(rotation * 3) % patients.length];
            rotation++;
            if (!patient) continue;

            const result = bookNth(date, typeId, n, patient.id);
            if (result) booked.push({ ...result, daysFromToday: offset });
        }
    }

    console.log(`booked ${booked.length} appointments across ${-21} … +14 days`);

    /*
     * Statuses. Everything is created `booked`, which is right for the future
     * and wrong for the past — a three-week-old appointment still sitting at
     * "booked" is a state the clinic never actually has, and it would make the
     * patient page and any future stats screen meaningless.
     */
    let done = 0;
    let noShow = 0;
    let cancelled = 0;

    for (const appointment of booked) {
        if (appointment.daysFromToday >= 0) continue;

        // Roughly one in seven no-shows, one in eleven cancelled late; the rest
        // attended. Deterministic rather than random so two runs of the seed
        // produce the same database and a bug found once can be found again.
        const status =
            appointment.id % 7 === 0 ? 'no_show' : appointment.id % 11 === 0 ? 'cancelled' : 'done';

        db.update(schema.appointments)
            .set({ status, updatedAt: now })
            .where(eq(schema.appointments.id, appointment.id))
            .run();

        if (status === 'done') done++;
        else if (status === 'no_show') noShow++;
        else cancelled++;
    }

    // One cancelled appointment in the future too — the day view has a strike
    // -through state that otherwise never appears on the screen being demoed.
    const futureCancel = booked.find((a) => a.daysFromToday > 1);
    if (futureCancel) {
        db.update(schema.appointments)
            .set({ status: 'cancelled', updatedAt: now })
            .where(eq(schema.appointments.id, futureCancel.id))
            .run();
        cancelled++;
    }

    console.log(`statuses: ${done} done, ${noShow} no-show, ${cancelled} cancelled`);

    /*
     * Reminders. `createReminderFor` left every one of these `pending`, which is
     * only true for the future. Past reminders need to have already happened,
     * and the failure and skip states need to exist — the desk's reminder panel
     * is a list of patients somebody has to phone, and an empty one demos
     * nothing.
     */
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const appointment of booked) {
        if (appointment.daysFromToday >= 0) continue;

        const reminder = db
            .select()
            .from(schema.reminders)
            .where(eq(schema.reminders.appointmentId, appointment.id))
            .get();
        if (!reminder) continue;

        const roll = appointment.id % 9;
        const sentAt = new Date(new Date(appointment.startsAt).getTime() - 18 * 60 * 60_000).toISOString();

        if (roll === 0) {
            db.update(schema.reminders)
                .set({
                    status: 'failed',
                    attempts: 3,
                    error: 'WhatsApp disconnected while sending',
                    scheduledFor: sentAt,
                })
                .where(eq(schema.reminders.id, reminder.id))
                .run();
            failed++;
        } else if (roll === 1) {
            db.update(schema.reminders)
                .set({ status: 'skipped', skipReason: 'too_late', scheduledFor: sentAt })
                .where(eq(schema.reminders.id, reminder.id))
                .run();
            skipped++;
        } else if (roll === 2) {
            db.update(schema.reminders)
                .set({ status: 'skipped', skipReason: 'cancelled', scheduledFor: sentAt })
                .where(eq(schema.reminders.id, reminder.id))
                .run();
            skipped++;
        } else {
            db.update(schema.reminders)
                .set({ status: 'sent', sentAt, attempts: 1, scheduledFor: sentAt })
                .where(eq(schema.reminders.id, reminder.id))
                .run();
            sent++;
        }
    }

    console.log(`reminders: ${sent} sent, ${failed} failed, ${skipped} skipped, rest pending`);

    // The whole point of the seed is that the search box has something to find.
    const sample = patients[0];
    if (sample) {
        console.log(`\ntry the desk search for "${sample.name}" or "${sample.phone.slice(-9)}"`);
    }

    closeDb();
}

main();
