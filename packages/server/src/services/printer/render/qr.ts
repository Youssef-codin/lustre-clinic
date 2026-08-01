import type { PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { INK } from './document.ts';

/**
 * QR codes are drawn as vector rectangles rather than embedded as a raster
 * image. A PNG has a fixed pixel grid that a printer resamples, and a QR that
 * resamples badly is a QR that will not scan — which nobody notices until a
 * patient is standing at the desk holding a phone. Rectangles stay sharp at
 * whatever resolution the printer runs at, and cost no image encoding.
 */

/** Error correction M: ~15% recoverable, which survives a thumbprint or a fold. */
const ERROR_CORRECTION = 'M' as const;

interface Matrix {
    size: number;
    /** Row-major, 1 = dark. */
    data: Uint8Array;
}

export function qrMatrix(text: string): Matrix {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: ERROR_CORRECTION });
    return { size: modules.size, data: modules.data as Uint8Array };
}

interface Run {
    row: number;
    from: number;
    length: number;
}

/**
 * Merges each row's dark modules into horizontal runs, so a 29×29 code becomes
 * a few hundred rectangles instead of ~400 individual ones. Purely a size and
 * draw-time saving; the printed result is identical.
 */
export function darkRuns({ size, data }: Matrix): Run[] {
    const runs: Run[] = [];

    for (let row = 0; row < size; row += 1) {
        let from = -1;

        for (let col = 0; col <= size; col += 1) {
            const dark = col < size && data[row * size + col] === 1;

            if (dark && from === -1) {
                from = col;
            } else if (!dark && from !== -1) {
                runs.push({ row, from, length: col - from });
                from = -1;
            }
        }
    }

    return runs;
}

export interface QrOptions {
    /** Bottom-left corner. */
    x: number;
    y: number;
    /** Side length in points, quiet zone included. */
    size: number;
}

/**
 * Draws the code with the 4-module quiet zone the QR spec requires — without
 * it, scanners fail against a busy background like a ruled table row.
 */
export function drawQr(page: PDFPage, text: string, { x, y, size }: QrOptions): void {
    const matrix = qrMatrix(text);
    const QUIET = 4;
    const total = matrix.size + QUIET * 2;
    const module = size / total;
    const origin = { x: x + QUIET * module, y: y + QUIET * module };

    for (const run of darkRuns(matrix)) {
        page.drawRectangle({
            x: origin.x + run.from * module,
            // Matrix rows run top-down; PDF y runs bottom-up.
            y: origin.y + (matrix.size - 1 - run.row) * module,
            width: run.length * module,
            height: module,
            color: INK,
        });
    }
}
