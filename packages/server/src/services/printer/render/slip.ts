import { type AppointmentWithPatient, appointmentTypeLabel, clinicAddress, clinicName } from '@mawid/shared';
import type { PDFPage } from 'pdf-lib';
import type { Config } from '../../../config/index.ts';
import { scanUrl } from '../../../util/network.ts';
import {
    A5,
    addPage,
    createDoc,
    type Doc,
    formatDate,
    formatTime,
    hairline,
    INK,
    MARGIN,
} from './document.ts';
import { printLabels } from './labels.ts';
import { drawQr } from './qr.ts';
import { drawShapedText, drawShapedTextRight, ltr, wrapText } from './text.ts';

/**
 * The booking slip: clinic name, patient, phone, date, time, duration, type,
 * ref, and a blank `Booked: ______` line for the secretary's initials. Spec §7.
 *
 * Laid out right-aligned for Arabic and left-aligned for English, off the one
 * `rtl` flag — the label column and the value column swap sides, everything
 * else is the same page.
 */

const TITLE_SIZE = 17;
const LABEL_SIZE = 10.5;
const VALUE_SIZE = 13;
const ROW_GAP = 30;
const QR_SIZE = 92;

interface Row {
    label: string;
    value: string;
    /** Values that must not be reordered by bidi — refs, phones, times. */
    literal?: boolean;
}

function drawRow(doc: Doc, page: PDFPage, row: Row, y: number, left: number, right: number): void {
    const value = row.literal ? ltr(row.value) : row.value;

    if (doc.rtl) {
        drawShapedTextRight(page, row.label, { right, y: y + 14, size: LABEL_SIZE, font: doc.font });
        drawShapedTextRight(page, value, { right, y, size: VALUE_SIZE, font: doc.font });
    } else {
        drawShapedText(page, row.label, {
            x: left,
            y: y + 14,
            size: LABEL_SIZE,
            font: doc.font,
            base: 'ltr',
        });
        drawShapedText(page, value, { x: left, y, size: VALUE_SIZE, font: doc.font, base: 'ltr' });
    }
}

export async function renderSlip(appointment: AppointmentWithPatient, config: Config): Promise<Uint8Array> {
    const locale = config.defaultLocale;
    const doc = await createDoc(locale);
    const page = addPage(doc, A5);
    const labels = printLabels(locale);
    const { timezone } = config.clinic;

    const left = MARGIN;
    const right = A5[0] - MARGIN;
    const anchor = doc.rtl ? right : left;
    const draw = (text: string, y: number, size: number) =>
        doc.rtl
            ? drawShapedTextRight(page, text, { right, y, size, font: doc.font })
            : drawShapedText(page, text, { x: left, y, size, font: doc.font, base: 'ltr' });

    let y = A5[1] - MARGIN - TITLE_SIZE;

    // ---- clinic header -----------------------------------------------------
    draw(clinicName(config.clinic, locale), y, TITLE_SIZE);
    y -= 18;
    draw(clinicAddress(config.clinic, locale), y, LABEL_SIZE);
    y -= 14;
    draw(ltr(config.clinic.phone), y, LABEL_SIZE);

    y -= 16;
    hairline(page, y, left, right);
    y -= 26;

    draw(labels.slipTitle, y, VALUE_SIZE);
    y -= 30;

    // ---- the appointment ---------------------------------------------------
    const type = config.appointmentTypes.find((t) => t.id === appointment.typeId);

    const rows: Row[] = [
        { label: labels.patient, value: appointment.patient.name },
        { label: labels.phone, value: appointment.patient.phone, literal: true },
        { label: labels.date, value: formatDate(appointment.startsAt, timezone, locale) },
        { label: labels.time, value: formatTime(appointment.startsAt, timezone, locale), literal: true },
        {
            label: labels.duration,
            value: `${appointment.durationMin} ${labels.minutes}`,
        },
        {
            label: labels.type,
            value: type ? appointmentTypeLabel(type, locale) : appointment.typeId,
        },
        { label: labels.ref, value: appointment.ref, literal: true },
    ];

    for (const row of rows) {
        drawRow(doc, page, row, y, left, right);
        y -= ROW_GAP;
    }

    /*
     * The QR and the signature line are pinned to the bottom of the page rather
     * than flowed after the details. Flowing them meant a long note pushed the
     * QR off the sheet — and a slip that prints without its code is one the
     * patient cannot scan, with nothing on the page to say so.
     */
    const signatureY = MARGIN + 18;
    const bandRuleY = signatureY + 28;
    const refY = bandRuleY + 16;
    const qrY = refY + 16;
    const bandTop = qrY + QR_SIZE;

    if (appointment.note) {
        const lines = wrapText(appointment.note, VALUE_SIZE, right - left, doc.rtl ? 'rtl' : 'ltr');
        // Only as many lines as clear the bottom band; the note is a courtesy,
        // the QR is not.
        const room = Math.max(0, Math.floor((y - bandTop - LABEL_SIZE) / 18));

        // An ellipsis where it was cut, so nobody reads a half sentence as the
        // whole note. The full text is on the patient's page.
        const shown = lines.slice(0, Math.max(1, room));
        if (shown.length < lines.length) shown[shown.length - 1] = `${shown.at(-1)} …`;

        drawRow(doc, page, { label: labels.note, value: shown[0] ?? '' }, y, left, right);
        y -= 18;

        for (const line of shown.slice(1)) {
            draw(line, y, VALUE_SIZE);
            y -= 18;
        }
    }

    // ---- QR ----------------------------------------------------------------
    // Scanning this opens the patient's page on a phone and makes the desk
    // screen jump to them. Spec §9 — the URL's host is resolved at print time.
    const qrX = doc.rtl ? right - QR_SIZE : left;
    drawQr(page, scanUrl(config, appointment.ref), { x: qrX, y: qrY, size: QR_SIZE });

    // The ref repeated under the code, so a phone that will not scan can still
    // be typed in — paper must never depend on a camera working.
    if (doc.rtl) {
        drawShapedTextRight(page, ltr(appointment.ref), {
            right: qrX + QR_SIZE,
            y: refY,
            size: LABEL_SIZE,
            font: doc.font,
        });
    } else {
        drawShapedText(page, ltr(appointment.ref), {
            x: qrX,
            y: refY,
            size: LABEL_SIZE,
            font: doc.font,
            base: 'ltr',
        });
    }

    // ---- the blank line the doctor writes on -------------------------------
    hairline(page, bandRuleY, left, right);

    const bookedLabel = `${labels.bookedBy}:`;
    const labelWidth = doc.rtl
        ? drawShapedTextRight(page, bookedLabel, {
              right,
              y: signatureY,
              size: VALUE_SIZE,
              font: doc.font,
          })
        : drawShapedText(page, bookedLabel, {
              x: left,
              y: signatureY,
              size: VALUE_SIZE,
              font: doc.font,
              base: 'ltr',
          });

    // A ruled line to sign on, running away from the label toward the far margin.
    page.drawLine({
        start: { x: doc.rtl ? left : anchor + labelWidth + 10, y: signatureY - 3 },
        end: { x: doc.rtl ? right - labelWidth - 10 : right, y: signatureY - 3 },
        thickness: 0.75,
        color: INK,
    });

    return doc.doc.save();
}
