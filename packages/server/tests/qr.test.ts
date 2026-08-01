import { describe, expect, test } from 'bun:test';
import type { Config } from '../src/config/index.ts';
import { darkRuns, qrMatrix } from '../src/services/printer/render/qr.ts';
import { lanIp, printBaseUrl, scanUrl } from '../src/util/network.ts';
import { loadTestConfig } from './helpers/app.ts';

const config = loadTestConfig();
const withHostname = (hostname: string): Config => ({ ...config, hostname });

describe('the QR matrix', () => {
    test('encodes a scan URL', () => {
        const matrix = qrMatrix('http://mawid:8080/s/030826-01');

        expect(matrix.size).toBeGreaterThan(0);
        expect(matrix.data.length).toBe(matrix.size * matrix.size);
        expect(matrix.data.some((m) => m === 1)).toBe(true);
    });

    test('run merging is lossless', () => {
        // The drawing code emits merged horizontal runs rather than one
        // rectangle per module. If that merge lost or shifted a single module
        // the code would still look like a QR and simply refuse to scan, so the
        // matrix is reconstructed from the runs and compared.
        const matrix = qrMatrix('http://mawid:8080/s/030826-42');
        const rebuilt = new Uint8Array(matrix.size * matrix.size);

        for (const run of darkRuns(matrix)) {
            for (let i = 0; i < run.length; i += 1) {
                rebuilt[run.row * matrix.size + run.from + i] = 1;
            }
        }

        expect(Array.from(rebuilt)).toEqual(Array.from(matrix.data));
    });

    test('merging actually reduces the rectangle count', () => {
        const matrix = qrMatrix('http://mawid:8080/s/030826-01');
        const dark = matrix.data.reduce<number>((n, m) => n + (m === 1 ? 1 : 0), 0);

        expect(darkRuns(matrix).length).toBeLessThan(dark);
    });

    test('a longer URL still fits, at a higher version', () => {
        const short = qrMatrix('http://mawid:8080/s/030826-01');
        const long = qrMatrix('http://a-rather-long-clinic-hostname.local:8080/s/030826-999');

        expect(long.size).toBeGreaterThanOrEqual(short.size);
    });

    test('prints large enough to scan', () => {
        // The day schedule draws this at 56pt. Phone cameras need roughly half a
        // millimetre per module off paper; below that it photographs as mush.
        const units = qrMatrix('http://mawid:8080/s/030826-01').size + 8;
        const mmPerModule = ((56 / units) * 25.4) / 72;

        expect(mmPerModule).toBeGreaterThan(0.5);
    });
});

describe('the printed URL', () => {
    test('prefers the configured hostname so old slips survive a DHCP change', () => {
        expect(printBaseUrl(withHostname('mawid'))).toBe('http://mawid:8080');
    });

    test('falls back to the detected LAN address when no hostname is set up', () => {
        const detected = lanIp();
        const expected = detected ? `http://${detected}:8080` : 'http://localhost:8080';

        expect(printBaseUrl(withHostname('localhost'))).toBe(expected);
    });

    test('never prints a loopback address a phone cannot reach', () => {
        const detected = lanIp();
        if (!detected) return;

        for (const loopback of ['localhost', '127.0.0.1', '0.0.0.0']) {
            expect(printBaseUrl(withHostname(loopback))).not.toContain(loopback);
        }
    });

    test('a detected address is a LAN address, not a public one', () => {
        const detected = lanIp();
        if (!detected) return;

        expect(detected).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
        expect(detected).not.toStartWith('127.');
    });

    test('builds the /s/:ref target', () => {
        expect(scanUrl(withHostname('mawid'), '030826-01')).toBe('http://mawid:8080/s/030826-01');
    });
});
