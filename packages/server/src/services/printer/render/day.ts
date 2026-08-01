import { type AppointmentWithPatient, appointmentTypeLabel, clinicName, type IsoDate } from '@mawid/shared';
import type { PDFPage } from 'pdf-lib';
import type { Config } from '../../../config/index.ts';
import { scanUrl } from '../../../util/network.ts';
import { clinicTimeToInstant } from '../../../util/time.ts';
import { A4, addPage, createDoc, formatDate, formatTime, hairline, MARGIN } from './document.ts';
import { printLabels } from './labels.ts';
import { drawQr } from './qr.ts';
import { drawShapedText, drawShapedTextRight, ltr, truncateToWidth } from './text.ts';

/**
 * The day schedule: every appointment in time order, with a wide blank column
 * for handwriting. The doctor writes on this sheet today and must be able to
 * keep doing that — spec §7 — so the notes column is the widest thing on the
 * page and every row is ruled.
 *
 * Cancelled appointments are left out. The desk screen shows them so the
 * secretary can see what changed; the sheet in the doctor's hand should only
 * list people who are actually coming.
 */

const TITLE_SIZE = 16;
const HEADER_SIZE = 10;
const ROW_SIZE = 11.5;
/**
 * The row QR has to survive being scanned off paper by a phone, which needs
 * roughly half a millimetre per module. This code is 29 modules plus an
 * 8-module quiet zone, so 56pt gives ~0.53mm — below that it photographs as
 * mush. The row is sized around the code rather than the other way round.
 */
const QR_SIZE = 56;
const ROW_HEIGHT = 62;

/**
 * Fractions of the content width, in reading order; notes takes the rest and
 * stays the widest column. Phone is sized to hold a full E.164 number without
 * being trimmed — a truncated number on the doctor's sheet cannot be dialled,
 * which defeats the point of printing it.
 */
const COLUMNS = { qr: 0.115, time: 0.08, patient: 0.222, phone: 0.185, type: 0.118 };

interface Column {
    /** Distance from the reading-order start of the row. */
    offset: number;
    width: number;
}

function columnLayout(contentWidth: number): Record<keyof typeof COLUMNS | 'notes', Column> {
    let offset = 0;
    const take = (fraction: number): Column => {
        const column = { offset, width: contentWidth * fraction };
        offset += column.width;
        return column;
    };

    return {
        qr: take(COLUMNS.qr),
        time: take(COLUMNS.time),
        patient: take(COLUMNS.patient),
        phone: take(COLUMNS.phone),
        type: take(COLUMNS.type),
        notes: { offset, width: contentWidth - offset },
    };
}

export async function renderDaySchedule(
    date: IsoDate,
    appointments: AppointmentWithPatient[],
    config: Config,
): Promise<Uint8Array> {
    const locale = config.defaultLocale;
    const doc = await createDoc(locale);
    const labels = printLabels(locale);
    const { timezone } = config.clinic;

    const left = MARGIN;
    const right = A4[0] - MARGIN;
    const contentWidth = right - left;
    const columns = columnLayout(contentWidth);

    /**
     * Places a cell by reading order: from the right in Arabic, the left in
     * English. Text is trimmed to the column so a long name cannot run into the
     * neighbouring one — on screen that is ugly, on paper it is unreadable.
     */
    const cell = (page: PDFPage, column: Column, raw: string, y: number, size: number) => {
        const text = truncateToWidth(raw, size, column.width - 8, doc.rtl ? 'rtl' : 'ltr');
        return doc.rtl
            ? drawShapedTextRight(page, text, {
                  right: right - column.offset,
                  y,
                  size,
                  font: doc.font,
              })
            : drawShapedText(page, text, {
                  x: left + column.offset,
                  y,
                  size,
                  font: doc.font,
                  base: 'ltr',
              });
    };

    const dayStart = clinicTimeToInstant(date, '00:00', timezone).toISOString();
    const fullWidth: Column = { offset: 0, width: contentWidth };

    const startHeader = (page: PDFPage): number => {
        let y = A4[1] - MARGIN - TITLE_SIZE;

        cell(page, fullWidth, clinicName(config.clinic, locale), y, TITLE_SIZE);

        y -= 20;
        cell(page, fullWidth, labels.daySchedule, y, HEADER_SIZE + 2);
        y -= 16;
        cell(page, fullWidth, formatDate(dayStart, timezone, locale), y, HEADER_SIZE);

        y -= 18;
        hairline(page, y, left, right);
        y -= 16;

        cell(page, columns.time, labels.columnTime, y, HEADER_SIZE);
        cell(page, columns.patient, labels.columnPatient, y, HEADER_SIZE);
        cell(page, columns.phone, labels.columnPhone, y, HEADER_SIZE);
        cell(page, columns.type, labels.columnType, y, HEADER_SIZE);
        cell(page, columns.notes, labels.columnNotes, y, HEADER_SIZE);

        y -= 10;
        hairline(page, y, left, right, 1.25);
        return y - ROW_HEIGHT + 8;
    };

    let page = addPage(doc, A4);
    let y = startHeader(page);

    const visible = appointments.filter((a) => a.status !== 'cancelled');

    if (visible.length === 0) {
        cell(page, fullWidth, labels.noAppointments, y, ROW_SIZE);
        return doc.doc.save();
    }

    for (const appointment of visible) {
        // A row must not straddle a page break — the doctor's handwriting space
        // has to stay with the name it belongs to.
        if (y < MARGIN + ROW_HEIGHT) {
            page = addPage(doc, A4);
            y = startHeader(page);
        }

        const type = config.appointmentTypes.find((t) => t.id === appointment.typeId);

        // One QR per row (spec §7): the doctor scans the row he is looking at
        // and that patient opens on his phone.
        drawQr(page, scanUrl(config, appointment.ref), {
            x: doc.rtl ? right - columns.qr.offset - QR_SIZE : left + columns.qr.offset,
            y: y - 8,
            size: QR_SIZE,
        });

        cell(page, columns.time, ltr(formatTime(appointment.startsAt, timezone, locale)), y, ROW_SIZE);
        cell(page, columns.patient, appointment.patient.name, y, ROW_SIZE);
        cell(page, columns.phone, ltr(appointment.patient.phone), y, ROW_SIZE);
        cell(page, columns.type, type ? appointmentTypeLabel(type, locale) : appointment.typeId, y, ROW_SIZE);

        hairline(page, y - 10, left, right);
        y -= ROW_HEIGHT;
    }

    return doc.doc.save();
}
