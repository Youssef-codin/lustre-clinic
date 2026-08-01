import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '../../../config/index.ts';
import { logger } from '../../../middleware/logger.ts';
import { resolveConfigured } from '../../../util/paths.ts';
import type { PrintDriver, PrintJob } from '../driver.ts';

/**
 * The production driver: render to PDF, then hand the file to the OS print
 * command. Works with any printer the machine already has installed — inkjet,
 * laser, or thermal with a driver — and Arabic is the PDF renderer's problem
 * rather than the printer firmware's. See spec §7.
 *
 * Windows uses SumatraPDF, a single portable exe shipped beside the binary; it
 * is far more reliable for silent printing than PowerShell's `Out-Printer`.
 * Linux and macOS use `lp`, which is what development runs on.
 */

interface Command {
    exe: string;
    args: string[];
}

function windowsCommand(config: Config, file: string): Command {
    const sumatra = resolveConfigured(config.printing.sumatraPath ?? './SumatraPDF.exe');
    const printer = config.printing.printerName;

    return {
        exe: sumatra,
        args: [
            ...(printer ? ['-print-to', printer] : ['-print-to-default']),
            '-silent',
            '-exit-when-done',
            file,
        ],
    };
}

function unixCommand(config: Config, file: string): Command {
    const printer = config.printing.printerName;
    return { exe: 'lp', args: [...(printer ? ['-d', printer] : []), file] };
}

function commandFor(config: Config, file: string): Command {
    return process.platform === 'win32' ? windowsCommand(config, file) : unixCommand(config, file);
}

async function run({ exe, args }: Command): Promise<void> {
    const proc = Bun.spawn([exe, ...args], { stdout: 'pipe', stderr: 'pipe' });
    const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);

    if (exitCode !== 0) {
        throw new Error(`${exe} exited ${exitCode}${stderr.trim() ? `: ${stderr.trim()}` : ''}`);
    }
}

export function pdfDriver(config: Config): PrintDriver {
    const spool = join(tmpdir(), 'mawid-print');

    return {
        name: 'pdf',

        /**
         * Checks the print command itself, not the printer. A printer that is
         * off still accepts a spooled job; a missing SumatraPDF never will, and
         * that is the failure worth catching at boot.
         */
        async available() {
            if (process.platform === 'win32') {
                const { exe } = windowsCommand(config, '');
                if (!existsSync(exe)) {
                    logger.error({ exe }, 'SumatraPDF not found — ship it beside the executable');
                    return false;
                }
                return true;
            }

            try {
                await run({ exe: 'lp', args: ['-h'] });
                return true;
            } catch {
                // `lp -h` exits non-zero on some platforms; presence is what matters.
                return existsSync('/usr/bin/lp');
            }
        },

        async print(job: PrintJob) {
            mkdirSync(spool, { recursive: true });
            const file = join(spool, `${job.id}.pdf`);

            writeFileSync(file, await job.render());
            try {
                await run(commandFor(config, file));
                logger.info({ job: job.id, kind: job.target.kind }, 'sent to printer');
            } finally {
                // The spooler has read the file by the time the command returns.
                rmSync(file, { force: true });
            }
        },
    };
}
