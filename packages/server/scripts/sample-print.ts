/**
 * Renders the two printable documents to `docs/` so they can be looked at, and
 * reviewed in a diff, without a printer or a running server.
 *
 * These are the *real* renderers the print queue calls — not a mock-up of them.
 * The slip in `docs/` is therefore exactly what comes out of the printer, QR
 * code and Arabic shaping included, which is the only way to review the layout
 * of a document whose text is bidirectional.
 *
 * With `--print` it also sends the slip to the real printer through the
 * configured driver, without needing the server up — which is what a demo
 * rehearsal wants when a slip is smudged or the QR needs reprinting after the
 * machine's LAN address has moved.
 *
 *   bun run sample-print              # uses the newest appointment in the database
 *   bun run sample-print 42           # uses appointment id 42
 *   bun run sample-print 42 --print   # …and puts it on paper
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { desc } from 'drizzle-orm';
import { loadConfig, setConfig } from '../src/config/index.ts';
import { closeDb, getDb, openDb, schema } from '../src/db/index.ts';
import { getAppointment, listDay } from '../src/modules/appointment/appointment.service.ts';
import {
    flush,
    printSlip,
    recentFailures,
    renderDaySchedule,
    renderSlip,
    startPrinter,
} from '../src/services/printer/index.ts';
import { scanUrl } from '../src/util/network.ts';
import { clinicDate } from '../src/util/time.ts';

const OUT = join(import.meta.dir, '../../../docs');

async function main(): Promise<void> {
    const config = setConfig(loadConfig());
    openDb(config.database);

    const args = process.argv.slice(2);
    const wantsPaper = args.includes('--print');
    const requested = args.find((arg) => !arg.startsWith('--'));
    const id = requested
        ? Number(requested)
        : getDb()
              .select({ id: schema.appointments.id })
              .from(schema.appointments)
              .orderBy(desc(schema.appointments.startsAt))
              .get()?.id;

    if (id === undefined || Number.isNaN(id)) {
        console.error('no appointments in the database — run `bun run seed` first');
        closeDb();
        process.exit(1);
    }

    const appointment = getAppointment(id);
    const date = clinicDate(appointment.startsAt, config.clinic.timezone);

    await mkdir(OUT, { recursive: true });

    const slip = await renderSlip(appointment, config);
    await Bun.write(join(OUT, 'sample-slip.pdf'), slip);
    console.log(`docs/sample-slip.pdf — ${appointment.ref}, ${appointment.patient.name}`);

    // The day schedule is the other thing that reaches paper, and it is the one
    // with a table in it — the layout most likely to break on a long name.
    const day = listDay(date);
    const schedule = await renderDaySchedule(date, day, config);
    await Bun.write(join(OUT, 'sample-day.pdf'), schedule);
    console.log(`docs/sample-day.pdf  — ${date}, ${day.length} appointments`);

    if (wantsPaper) {
        // Printed before the URL is reported, but reported either way: a slip
        // whose QR points somewhere the phone cannot reach is the failure this
        // whole path exists to avoid, and it is invisible on the paper itself.
        await startPrinter(config);
        printSlip(appointment);
        await flush();

        const failures = recentFailures();
        if (failures.length > 0) {
            console.error(`print FAILED: ${JSON.stringify(failures)}`);
            closeDb();
            process.exit(1);
        }

        console.log(`printed ${appointment.ref} → ${config.printing.driver} driver`);
        console.log(`its QR points at ${scanUrl(config, appointment.ref)}`);
    }

    closeDb();
}

await main();
