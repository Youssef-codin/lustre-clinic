/**
 * Prints a real patient's booking slip, on the real printer, from the desk.
 *
 * This is the reprint path for the times paper goes wrong and nobody is at the
 * screen: the slip jammed, it came out smudged, the patient lost it, or the
 * appointment was moved and the code on the paper in their hand now points at
 * the old day. Reprinting just renders again from the database — a slip is
 * never "lost", and the QR's host is resolved fresh each time, so a reprint
 * after the machine's LAN address moved scans correctly where the old one does
 * not (spec §9).
 *
 * Look the patient up however you have them written down — the ref off an old
 * slip, a phone number as the secretary typed it, or part of a name:
 *
 *   bun run print-patient 200826-01        # a ref, printed straight away
 *   bun run print-patient 01012345678      # a phone, in any of its forms
 *   bun run print-patient "خالد"            # part of a name
 *   bun run print-patient "Khaled" --all   # list their appointments, print none
 *   bun run print-patient "Khaled" --dry-run   # render to a file, no paper
 *
 * By default it prints the patient's **next** appointment, because that is the
 * one a reprint is nearly always for; if they have nothing upcoming it falls
 * back to their most recent and says so. To print any other one, `--all` lists
 * their refs and a ref prints exactly that appointment.
 *
 * An ambiguous search never prints. Two patients matching "Ahmed" get listed so
 * you can pick, rather than one of them guessed at and handed to a person.
 */
import { type AppointmentWithPatient, appointmentRefSchema } from '@mawid/shared';
import { desc, eq } from 'drizzle-orm';
import { loadConfig, setConfig } from '../src/config/index.ts';
import { closeDb, getDb, openDb, schema } from '../src/db/index.ts';
import { getAppointment } from '../src/modules/appointment/appointment.service.ts';
import { searchPatients } from '../src/modules/patient/patient.service.ts';
import { flush, printSlip, recentFailures, renderSlip, startPrinter } from '../src/services/printer/index.ts';
import { scanUrl } from '../src/util/network.ts';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const query = args.find((a) => !a.startsWith('--'));

function die(message: string): never {
    console.error(message);
    closeDb();
    process.exit(1);
}

/** Every appointment for a patient, soonest last — the patient page's order. */
function appointmentsFor(patientId: number): AppointmentWithPatient[] {
    return getDb()
        .select({ id: schema.appointments.id })
        .from(schema.appointments)
        .where(eq(schema.appointments.patientId, patientId))
        .orderBy(desc(schema.appointments.startsAt))
        .all()
        .map((row) => getAppointment(row.id));
}

function appointmentByRef(ref: string): AppointmentWithPatient {
    const row = getDb()
        .select({ id: schema.appointments.id })
        .from(schema.appointments)
        .where(eq(schema.appointments.ref, ref))
        .get();

    if (!row) die(`No appointment with ref ${ref}.`);
    return getAppointment(row.id);
}

function describe(appointment: AppointmentWithPatient, timezone: string): string {
    const when = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(appointment.startsAt));

    const status = appointment.status === 'booked' ? '' : `  [${appointment.status}]`;
    return `${appointment.ref}  ${when}  ${appointment.patient.name}${status}`;
}

async function main(): Promise<void> {
    const config = setConfig(loadConfig());
    openDb(config.database);

    const { timezone } = config.clinic;

    if (!query) {
        die(
            'Usage: bun run print-patient <ref | phone | name> [--all] [--dry-run]\n' +
                "  --all      list the patient's appointments and their refs, print nothing\n" +
                '  --dry-run  render to the print output folder without using the printer',
        );
    }

    // ---- find the appointment ----------------------------------------------
    let appointment: AppointmentWithPatient;

    if (appointmentRefSchema.safeParse(query).success) {
        // A ref names exactly one appointment, so there is nothing to choose.
        appointment = appointmentByRef(query.trim());
    } else {
        const matches = searchPatients(query, 10);

        if (matches.length > 1) {
            // Never guess which patient. Paper is handed to a person.
            console.error(`"${query}" matches ${matches.length} patients:\n`);
            for (const m of matches) console.error(`  ${m.name}  ${m.phone}`);
            console.error('\nNarrow the search, or use a ref code from an old slip.');
            closeDb();
            process.exit(1);
        }

        const [patient] = matches;
        if (!patient) die(`No patient matches "${query}".`);

        const all = appointmentsFor(patient.id);
        const [mostRecent] = all;
        if (!mostRecent) die(`${patient.name} has no appointments.`);

        if (flags.has('--all')) {
            console.log(`${patient.name}  ${patient.phone}\n`);
            for (const a of all) console.log(`  ${describe(a, timezone)}`);
            console.log('\nPrint one with: bun run print-patient <ref>');
            closeDb();
            return;
        }

        const now = Date.now();
        // `all` is newest first, so the next appointment is the last one that
        // has not happened yet.
        const upcoming = all.filter((a) => Date.parse(a.startsAt) >= now && a.status !== 'cancelled');
        const next = upcoming.at(-1);

        if (next) {
            appointment = next;
        } else {
            appointment = mostRecent;
            console.log(`${patient.name} has nothing upcoming — printing their most recent.`);
        }
    }

    console.log(describe(appointment, timezone));

    // ---- put it on paper ----------------------------------------------------
    if (flags.has('--dry-run')) {
        const out = `${config.printing.outputDir ?? '.'}/slip-${appointment.ref}.pdf`;
        await Bun.write(out, await renderSlip(appointment, config));
        console.log(`${out} — not printed (--dry-run)`);
        closeDb();
        return;
    }

    await startPrinter(config);
    printSlip(appointment);
    await flush();

    const failures = recentFailures();
    if (failures.length > 0) {
        die(`print FAILED: ${JSON.stringify(failures)}`);
    }

    console.log(`printed → ${config.printing.driver} driver`);
    // Reported every time: a slip whose QR points somewhere the phone cannot
    // reach is the failure this path exists to fix, and it is invisible on the
    // paper itself.
    console.log(`its QR points at ${scanUrl(config, appointment.ref)}`);

    closeDb();
}

await main();
