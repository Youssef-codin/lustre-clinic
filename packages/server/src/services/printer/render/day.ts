import { type AppointmentWithPatient, appointmentTypeLabel, clinicName, type IsoDate } from '@mawid/shared';
import type { PDFPage } from 'pdf-lib';
import type { Config } from '../../../config/index.ts';
import { scanUrl } from '../../../util/network.ts';
import { clinicTimeToInstant } from '../../../util/time.ts';
import {
    A4,
    addPage,
    band,
    createDoc,
    formatDate,
    formatStamp,
    formatTime,
    hairline,
    INK,
    MARGIN,
    MUTED,
    printLocale,
    RULE,
    ZEBRA,
} from './document.ts';
import { printLabels } from './labels.ts';
import { drawQr } from './qr.ts';
import { type BaseDirection, drawShapedText, drawShapedTextRight, ltr, truncateToWidth } from './text.ts';

/**
 * The day schedule: every appointment in time order, with a wide blank column
 * for handwriting. The doctor writes on this sheet today and must be able to
 * keep doing that — spec §7 — so the notes column is the widest thing on the
 * page, carries a ruled line to write on, and every row is banded.
 *
 * The banding is not decoration either. A row is 531pt wide, and tracking from
 * a time on one edge to the notes column on the other across unbroken white is
 * how a doctor ends up writing against the wrong name.
 *
 * Cancelled appointments are left out. The desk screen shows them so the
 * secretary can see what changed; the sheet in the doctor's hand should only
 * list people who are actually coming.
 */

const TITLE_SIZE = 16;
const SUBTITLE_SIZE = 12;
const HEADER_SIZE = 10;
const ROW_SIZE = 11.5;
const FOOT_SIZE = 8;
/**
 * The row QR has to survive being scanned off paper by a phone, which needs
 * roughly half a millimetre per module. This code is 29 modules plus an
 * 8-module quiet zone, so 56pt gives ~0.53mm — below that it photographs as
 * mush. The row is sized around the code rather than the other way round.
 */
const QR_SIZE = 56;
const ROW_HEIGHT = 62;
/** The column-header strip the labels sit in. */
const STRIP_HEIGHT = 20;
const FOOTER_Y = 20;
/** A row may not start below this, or its handwriting space runs off the sheet. */
const BOTTOM_LIMIT = MARGIN + 12;

/**
 * Fractions of the content width, in reading order; notes takes the rest and
 * stays the widest column. Phone is sized to hold a full E.164 number without
 * being trimmed — a truncated number on the doctor's sheet cannot be dialled,
 * which defeats the point of printing it.
 *
 * `type` is wide enough for the longest English label (`Extraction`, 65pt at
 * row size) rather than the longest Arabic one, which is a third shorter. The
 * extra came out of `notes`: every other column carries data that would start
 * truncating, whereas notes is blank space and loses nothing but 6pt of
 * handwriting width, still leaving it comfortably the widest column.
 */
const COLUMNS = { qr: 0.115, time: 0.08, patient: 0.222, phone: 0.185, type: 0.13 };

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
    const locale = printLocale(config);
    const doc = await createDoc(locale);
    const labels = printLabels(locale);
    const { timezone } = config.clinic;

    const left = MARGIN;
    const right = A4[0] - MARGIN;
    const contentWidth = right - left;
    const columns = columnLayout(contentWidth);
    const base: BaseDirection = doc.rtl ? 'rtl' : 'ltr';

    interface CellOptions {
        bold?: boolean;
        color?: typeof INK;
    }

    /**
     * Places a cell by reading order: from the right in Arabic, the left in
     * English. Text is trimmed to the column so a long name cannot run into the
     * neighbouring one — on screen that is ugly, on paper it is unreadable.
     */
    const cell = (
        page: PDFPage,
        column: Column,
        raw: string,
        y: number,
        size: number,
        options: CellOptions = {},
    ) => {
        const text = truncateToWidth(raw, size, column.width - 8, base);
        const shared = { y, size, color: options.color ?? INK, base, bold: options.bold, font: doc.font };

        return doc.rtl
            ? drawShapedTextRight(page, text, { ...shared, right: right - column.offset })
            : drawShapedText(page, text, { ...shared, x: left + column.offset });
    };

    /** A column's horizontal extent on the page, whichever way the sheet reads. */
    const columnBounds = (column: Column): { x: number; width: number } => ({
        x: doc.rtl ? right - column.offset - column.width : left + column.offset,
        width: column.width,
    });

    const dayStart = clinicTimeToInstant(date, '00:00', timezone).toISOString();
    const fullWidth: Column = { offset: 0, width: contentWidth };

    /** Draws the repeating page furniture and returns the first row's top edge. */
    const startHeader = (page: PDFPage): number => {
        let y = A4[1] - MARGIN - TITLE_SIZE;

        cell(page, fullWidth, clinicName(config.clinic, locale), y, TITLE_SIZE, { bold: true });

        y -= 20;
        cell(page, fullWidth, labels.daySchedule, y, SUBTITLE_SIZE, { bold: true });
        y -= 16;
        cell(page, fullWidth, formatDate(dayStart, timezone, locale), y, HEADER_SIZE, { color: MUTED });

        // The column headers get a filled strip so they stop reading as data.
        y -= 20;
        const stripBottom = y - STRIP_HEIGHT;
        band(page, { x: left, y: stripBottom, width: contentWidth, height: STRIP_HEIGHT });

        const labelY = stripBottom + 6;
        cell(page, columns.time, labels.columnTime, labelY, HEADER_SIZE, { bold: true });
        cell(page, columns.patient, labels.columnPatient, labelY, HEADER_SIZE, { bold: true });
        cell(page, columns.phone, labels.columnPhone, labelY, HEADER_SIZE, { bold: true });
        cell(page, columns.type, labels.columnType, labelY, HEADER_SIZE, { bold: true });
        cell(page, columns.notes, labels.columnNotes, labelY, HEADER_SIZE, { bold: true });

        hairline(page, stripBottom, left, right, 1.25);
        return stripBottom;
    };

    let page = addPage(doc, A4);
    let rowTop = startHeader(page);
    // Restarts per page, so the striping never depends on where the fold landed.
    let rowOnPage = 0;

    const visible = appointments.filter((a) => a.status !== 'cancelled');

    if (visible.length === 0) {
        cell(page, fullWidth, labels.noAppointments, rowTop - 30, ROW_SIZE, { color: MUTED });
    }

    for (const appointment of visible) {
        // A row must not straddle a page break — the doctor's handwriting space
        // has to stay with the name it belongs to.
        if (rowTop - ROW_HEIGHT < BOTTOM_LIMIT) {
            page = addPage(doc, A4);
            rowTop = startHeader(page);
            rowOnPage = 0;
        }

        const rowBottom = rowTop - ROW_HEIGHT;

        // Before anything else on the row: pdf-lib paints in the order
        // operators are pushed, so a fill drawn later would cover the row.
        if (rowOnPage % 2 === 1) {
            band(page, { x: left, y: rowBottom, width: contentWidth, height: ROW_HEIGHT, color: ZEBRA });
        }

        const type = config.appointmentTypes.find((t) => t.id === appointment.typeId);

        // One QR per row (spec §7): the doctor scans the row he is looking at
        // and that patient opens on his phone.
        const qrY = rowBottom + (ROW_HEIGHT - QR_SIZE) / 2;
        drawQr(page, scanUrl(config, appointment.ref), {
            x: doc.rtl ? right - columns.qr.offset - QR_SIZE : left + columns.qr.offset,
            y: qrY,
            size: QR_SIZE,
        });

        // Text centred against the QR rather than hung from the top of the row,
        // so the row reads as one band instead of a line with space under it.
        const textY = qrY + QR_SIZE / 2 - ROW_SIZE * 0.36;

        cell(page, columns.time, ltr(formatTime(appointment.startsAt, timezone, locale)), textY, ROW_SIZE, {
            bold: true,
        });
        cell(page, columns.patient, appointment.patient.name, textY, ROW_SIZE);
        cell(page, columns.phone, ltr(appointment.patient.phone), textY, ROW_SIZE);
        cell(
            page,
            columns.type,
            type ? appointmentTypeLabel(type, locale) : appointment.typeId,
            textY,
            ROW_SIZE,
        );

        // The line the doctor actually writes on. The column has been reserved
        // for handwriting since the first version; it may as well be ruled.
        const notes = columnBounds(columns.notes);
        page.drawLine({
            start: { x: notes.x + 6, y: rowBottom + 16 },
            end: { x: notes.x + notes.width - 6, y: rowBottom + 16 },
            thickness: 0.5,
            color: RULE,
        });

        hairline(page, rowBottom, left, right);
        rowTop = rowBottom;
        rowOnPage += 1;
    }

    /*
     * Footers last: the page count is not known until the rows have been laid
     * out, and a sheet numbered `1 of 3` is the only thing that tells the
     * doctor a page went missing off the back.
     */
    const pages = doc.doc.getPages();
    const stamp = `${labels.printedAt} ${ltr(formatStamp(new Date().toISOString(), timezone, locale))}`;

    pages.forEach((p, index) => {
        const counter = `${labels.page} ${ltr(String(index + 1))} ${labels.of} ${ltr(String(pages.length))}`;
        const shared = { y: FOOTER_Y, size: FOOT_SIZE, color: MUTED, base, font: doc.font };

        if (doc.rtl) {
            drawShapedTextRight(p, stamp, { ...shared, right });
            drawShapedText(p, counter, { ...shared, x: left });
        } else {
            drawShapedText(p, stamp, { ...shared, x: left });
            drawShapedTextRight(p, counter, { ...shared, right });
        }
    });

    return doc.doc.save();
}
