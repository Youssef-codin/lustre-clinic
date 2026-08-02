import { type AppointmentWithPatient, appointmentTypeLabel, clinicAddress, clinicName } from '@mawid/shared';
import type { PDFPage } from 'pdf-lib';
import type { Config } from '../../../config/index.ts';
import { scanUrl } from '../../../util/network.ts';
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
    MUTED,
    printLocale,
    RULE,
} from './document.ts';
import { printLabels } from './labels.ts';
import { drawQr } from './qr.ts';
import {
    type BaseDirection,
    drawShapedText,
    drawShapedTextRight,
    ltr,
    measureText,
    wrapText,
} from './text.ts';

/**
 * The booking slip: clinic name, the appointment's date and time given the
 * whole width of a band, then who the patient is (name, file number, phone) and
 * what they are coming in for (reason, duration), a QR with its ref beneath,
 * and a blank `Booked: ______` line for the secretary's initials. Spec §7.
 *
 * It prints in `printing.locale` when the config sets one, which is not
 * necessarily the language the desk is running in.
 *
 * A4, like the day sheet — one page size means one paper tray, and the office
 * laser these go to is an A4 machine. The margin here is wider than the day
 * sheet's: that page is a dense table that wants every millimetre, this one is
 * a single page about a single appointment and reads better with air round it.
 *
 * Laid out right-aligned for Arabic and left-aligned for English, off the one
 * `rtl` flag — everything is placed against a reading-start or a reading-end
 * edge rather than a left or a right one, so the whole sheet mirrors together.
 *
 * The hierarchy is carried by weight and grey, not by size alone: this prints
 * on a mono laser and gets read at arm's length across a desk, so the two
 * things a patient looks for — what day, what time — are set large and bold in
 * a band of their own, and every label is dropped to grey so it stops
 * competing with the value beside it.
 */

/** Wider than the day sheet's 32pt. See the note on air, above. */
const SLIP_MARGIN = 48;

const TITLE_SIZE = 20;
const META_SIZE = 10;
const EYEBROW_SIZE = 10;
const LABEL_SIZE = 11;
const VALUE_SIZE = 15;
const TIME_SIZE = 34;
const DATE_SIZE = 14;
const NOTE_SIZE = 12;
const REF_SIZE = 16;
const HINT_SIZE = 10;
const SIGN_SIZE = 12;
const FOOT_SIZE = 8.5;

/** Detail rows stretch between these to absorb whatever the note leaves over. */
const ROW_GAP_MIN = 36;
const ROW_GAP_MAX = 58;
const NOTE_LEAD = 18;
/** Space between the last row's rule and the note's label. */
const NOTE_GAP = 4;
/** Lines of note the rows will always give up space for, if there is a note. */
const NOTE_MIN_LINES = 2;
/**
 * Exactly what the note block below consumes to show `NOTE_MIN_LINES`: the gap,
 * the label's own line, then the lines themselves. Derived rather than written
 * as a number, because the two drifted apart once already and the only symptom
 * was a note quietly truncating a line earlier than it needed to.
 */
const NOTE_RESERVE = NOTE_GAP + NOTE_LEAD + NOTE_MIN_LINES * NOTE_LEAD;

const QR_SIZE = 110;
const BAND_HEIGHT = 72;
/** Text inset from the band's own edges, so it never touches the fill. */
const BAND_PAD = 20;

/*
 * The bottom of the sheet is measured up from the page edge rather than flowed
 * down from the content, because the QR and the signature line have to be in
 * the same place on every slip whether or not there is a note. See the note
 * clamp below.
 */
const FOOTER_Y = SLIP_MARGIN;
const SIGNATURE_Y = FOOTER_Y + 34;
const STUB_RULE_Y = SIGNATURE_Y + 40;
const REF_Y = STUB_RULE_Y + 22;
const QR_Y = REF_Y + 14;
/** Nothing flowed from the top may cross this line. */
const STUB_TOP = QR_Y + QR_SIZE + 20;

interface Row {
    label: string;
    value: string;
    /** Values that must not be reordered by bidi — refs, phones, times. */
    literal?: boolean;
}

export async function renderSlip(appointment: AppointmentWithPatient, config: Config): Promise<Uint8Array> {
    const locale = printLocale(config);
    const doc = await createDoc(locale);
    const page = addPage(doc, A4);
    const labels = printLabels(locale);
    const { timezone } = config.clinic;

    const left = SLIP_MARGIN;
    const right = A4[0] - SLIP_MARGIN;
    const width = right - left;
    const base: BaseDirection = doc.rtl ? 'rtl' : 'ltr';

    /** The margin a line of text begins at, and the one it runs toward. */
    const startEdge = doc.rtl ? right : left;
    const endEdge = doc.rtl ? left : right;

    interface TextOptions {
        size: number;
        bold?: boolean;
        color?: typeof INK;
        /** Overrides the page margin — used inside the band and beside the QR. */
        edge?: number;
    }

    /** Sets text running from the reading-start side. Returns its width. */
    const atStart = (page: PDFPage, text: string, y: number, options: TextOptions): number => {
        const { size, bold, color = INK, edge = startEdge } = options;
        const shared = { y, size, color, base, bold, font: doc.font };

        return doc.rtl
            ? drawShapedTextRight(page, text, { ...shared, right: edge })
            : drawShapedText(page, text, { ...shared, x: edge });
    };

    /** Sets text hard against the reading-end side. */
    const atEnd = (page: PDFPage, text: string, y: number, options: TextOptions): number => {
        const { size, bold, color = INK, edge = endEdge } = options;
        const shared = { y, size, color, base, bold, font: doc.font };

        return doc.rtl
            ? drawShapedText(page, text, { ...shared, x: edge })
            : drawShapedTextRight(page, text, { ...shared, right: edge });
    };

    // ---- clinic header -----------------------------------------------------
    let y = A4[1] - SLIP_MARGIN - TITLE_SIZE;

    atStart(page, clinicName(config.clinic, locale), y, { size: TITLE_SIZE, bold: true });

    // Address and phone share one grey line. Three stacked lines of clinic
    // detail is more of the page than the letterhead is worth.
    y -= 18;
    const contact = `${clinicAddress(config.clinic, locale)} · ${ltr(config.clinic.phone)}`;
    atStart(page, contact, y, { size: META_SIZE, color: MUTED });

    y -= 16;
    hairline(page, y, left, right, 1.25);

    // ---- what the patient is actually looking for --------------------------
    y -= 24;
    atStart(page, labels.slipTitle, y, { size: EYEBROW_SIZE, color: MUTED });

    /*
     * The status rides on the title line rather than down in the detail rows,
     * because it describes the document, not the appointment: a freshly printed
     * slip is always `booked`, so the only time this says anything is on a
     * reprint of something that has since been cancelled or missed. That is
     * exactly when it needs to be the first thing read, not the sixth.
     */
    if (appointment.status !== 'booked') {
        atEnd(page, labels.statuses[appointment.status], y, { size: EYEBROW_SIZE, bold: true });
    }

    const bandBottom = y - 12 - BAND_HEIGHT;
    band(page, { x: left, y: bandBottom, width, height: BAND_HEIGHT });

    // Time and date share a baseline inside the band, the time set large enough
    // to be read without picking the paper up.
    const bandBaseline = bandBottom + 24;
    atStart(page, ltr(formatTime(appointment.startsAt, timezone, locale)), bandBaseline, {
        size: TIME_SIZE,
        bold: true,
        edge: doc.rtl ? right - BAND_PAD : left + BAND_PAD,
    });
    atEnd(page, formatDate(appointment.startsAt, timezone, locale), bandBaseline, {
        size: DATE_SIZE,
        edge: doc.rtl ? left + BAND_PAD : right - BAND_PAD,
    });

    // ---- the rest of the appointment ---------------------------------------
    const type = config.appointmentTypes.find((t) => t.id === appointment.typeId);

    // Date, time, status and ref are not here: the first two are the band
    // above, the status is on the title line, and the ref belongs under the QR
    // that encodes it.
    const rows: Row[] = [
        { label: labels.patient, value: appointment.patient.name },
        // The paper file this patient's history lives in. The clinic still
        // pulls a physical folder, and a name alone does not find it when two
        // patients share one.
        { label: labels.fileNo, value: String(appointment.patient.id).padStart(4, '0'), literal: true },
        { label: labels.phone, value: appointment.patient.phone, literal: true },
        {
            label: labels.reason,
            value: type ? appointmentTypeLabel(type, locale) : appointment.typeId,
        },
        { label: labels.duration, value: `${appointment.durationMin} ${labels.minutes}` },
    ];

    y = bandBottom - 34;

    /*
     * The rows share out whatever the stub does not need, so a slip with no
     * note does not leave a hole above the QR and a slip with one still has
     * somewhere to put it. Reserving the note's minimum here rather than
     * letting it fight for the space afterwards is what keeps both cases
     * looking deliberate: the gap moves, the stub never does.
     *
     * This is what carries the extra height of A4. The rows simply open up.
     */
    const slack = y - STUB_TOP - (appointment.note ? NOTE_RESERVE : 0);
    const gap = Math.max(ROW_GAP_MIN, Math.min(ROW_GAP_MAX, slack / rows.length));

    for (const row of rows) {
        // Label and value on one baseline, pushed to opposite margins. Stacking
        // them turned seven facts into fourteen lines of ladder.
        atStart(page, row.label, y, { size: LABEL_SIZE, color: MUTED });
        atEnd(page, row.literal ? ltr(row.value) : row.value, y, { size: VALUE_SIZE, bold: true });

        hairline(page, y - 11, left, right);
        y -= gap;
    }

    // ---- note ---------------------------------------------------------------
    if (appointment.note) {
        y -= NOTE_GAP;
        atStart(page, labels.note, y, { size: LABEL_SIZE, color: MUTED });
        y -= NOTE_LEAD;

        const lines = wrapText(appointment.note, NOTE_SIZE, width, base);

        /*
         * Only as many lines as clear the stub. A long note used to push the QR
         * off the sheet, and a slip that prints without its code is one the
         * patient cannot scan, with nothing on the page to say so. The note is
         * a courtesy; the QR is not.
         */
        const room = Math.max(1, Math.floor((y - STUB_TOP) / NOTE_LEAD));
        const shown = lines.slice(0, room);

        // An ellipsis where it was cut, so nobody reads a half sentence as the
        // whole note. The full text is on the patient's page.
        if (shown.length < lines.length) shown[shown.length - 1] = `${shown.at(-1)} …`;

        for (const line of shown) {
            atStart(page, line, y, { size: NOTE_SIZE });
            y -= NOTE_LEAD;
        }
    }

    // ---- the QR stub --------------------------------------------------------
    // Scanning this opens the patient's page on a phone and makes the desk
    // screen jump to them. Spec §9 — the URL's host is resolved at print time.
    hairline(page, STUB_TOP, left, right);

    const qrX = doc.rtl ? right - QR_SIZE : left;
    drawQr(page, scanUrl(config, appointment.ref), { x: qrX, y: QR_Y, size: QR_SIZE });

    // The ref directly under the code it encodes, centred on it and big enough
    // to be typed in from across a desk — paper must never depend on a camera
    // working. Centred rather than aligned to a margin so the pair reads as one
    // object, whichever way the sheet runs.
    const refText = ltr(appointment.ref);
    drawShapedText(page, refText, {
        x: qrX + (QR_SIZE - measureText(refText, REF_SIZE, base)) / 2,
        y: REF_Y,
        size: REF_SIZE,
        font: doc.font,
        bold: true,
        base,
    });

    // The instruction goes beside the code, in the space the ref left behind.
    atStart(page, labels.scanHint, QR_Y + QR_SIZE / 2, {
        size: HINT_SIZE,
        color: MUTED,
        edge: doc.rtl ? qrX - 18 : qrX + QR_SIZE + 18,
    });

    // ---- the blank line the doctor writes on -------------------------------
    hairline(page, STUB_RULE_Y, left, right);

    const bookedLabel = `${labels.bookedBy}:`;
    const labelWidth = atStart(page, bookedLabel, SIGNATURE_Y, { size: SIGN_SIZE, color: MUTED });

    // A ruled line to sign on, running away from the label toward the far
    // margin. Grey, not black: it is somewhere to write, not a border.
    const signLineY = SIGNATURE_Y - 3;
    page.drawLine({
        start: { x: doc.rtl ? left : startEdge + labelWidth + 12, y: signLineY },
        end: { x: doc.rtl ? startEdge - labelWidth - 12 : right, y: signLineY },
        thickness: 0.75,
        color: RULE,
    });

    // Which printing of this slip the patient is holding.
    atEnd(
        page,
        `${labels.printedAt} ${ltr(formatStamp(new Date().toISOString(), timezone, locale))}`,
        FOOTER_Y,
        { size: FOOT_SIZE, color: MUTED },
    );

    return doc.doc.save();
}
