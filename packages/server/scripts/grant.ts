/**
 * Issues a role code from the server itself and prints its QR in the terminal:
 *
 *   bun cli grant admin [label]           from a checkout
 *   lustre grant admin [label]            the compiled binary, on the clinic machine
 *
 * This is how the clinic gets its first admin, and how it gets one back if every
 * admin phone is lost. Any role can be issued, but the phones' own admin screen
 * is the everyday way; this one needs a shell on the server, which is the
 * authority it rests on. No phone is promoted by it: the code has to be scanned.
 *
 * The code is printed, never logged: whoever holds it takes the role.
 */
import { GRANT_TTL_MINUTES, MAX_DEVICE_LABEL, qrModules, type Role, roleSchema } from '@lustre/shared';
import { config } from '../src/config.ts';
import { sql } from '../src/db/index.ts';
import { logger } from '../src/logger.ts';
import { deviceService } from '../src/modules/device/device.service.ts';

const LABEL: Record<Role, string> = { admin: 'Admin', doctor: 'Doctor', secretary: 'Secretary' };

/** A light quiet zone around the code, which scanners need to find its edge. */
const QUIET = 4;

const WHITE_FG = '\x1b[97m';
const BLACK_FG = '\x1b[30m';
const WHITE_BG = '\x1b[107m';
const BLACK_BG = '\x1b[40m';
const RESET = '\x1b[0m';

/**
 * Two module rows per text line: the upper half-block takes the top row's
 * colour, the background the bottom row's. Colours are explicit rather than
 * left to the terminal, so the code reads dark-on-light on any theme.
 */
function terminalQr(modules: boolean[][]): string {
    const size = modules.length + QUIET * 2;
    const dark = (row: number, col: number) => modules[row - QUIET]?.[col - QUIET] === true;

    const lines: string[] = [];
    for (let row = 0; row < size; row += 2) {
        let line = '';
        for (let col = 0; col < size; col += 1) {
            const fg = dark(row, col) ? BLACK_FG : WHITE_FG;
            const bg = row + 1 < size && dark(row + 1, col) ? BLACK_BG : WHITE_BG;
            line += `${fg}${bg}▀`;
        }
        lines.push(`${line}${RESET}`);
    }
    return lines.join('\n');
}

const [roleArg, ...labelWords] = process.argv.slice(2);
const role = roleSchema.safeParse(roleArg);

if (!role.success) {
    logger.error(`usage: grant <admin|doctor|secretary> [label]`);
    process.exitCode = 1;
} else {
    const label = (labelWords.join(' ').trim() || LABEL[role.data]).slice(0, MAX_DEVICE_LABEL);
    try {
        const grant = await deviceService.issue({ role: role.data, label }, null);
        const expires = grant.expiresAt.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: config.CLINIC_TIME_ZONE,
        });
        process.stdout.write(
            `\n${terminalQr(qrModules(grant.payload))}\n\n` +
                `${LABEL[role.data]} code for "${label}". Scan it in the app: Settings → the role card → Scan a code.\n` +
                `One phone, once, within ${GRANT_TTL_MINUTES} minutes (until ${expires}).\n\n`,
        );
    } catch (err) {
        logger.error({ err }, 'grant failed');
        process.exitCode = 1;
    }
}

await sql.end();
