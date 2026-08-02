import type { Locale } from '@mawid/shared';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import type { Config } from '../../../config/index.ts';
import { getFont } from './font.ts';

/**
 * The language the paper is printed in, which is not necessarily the desk's.
 * See `printing.locale` in the config schema.
 */
export function printLocale(config: Config): Locale {
    return config.printing.locale ?? config.defaultLocale;
}

/**
 * Points. Both printed documents are A4 — one page size means one paper tray,
 * and nobody has to notice which document is coming out before loading it.
 */
export const A4: [number, number] = [595, 842];

export const MARGIN = 32;
export const INK = rgb(0, 0, 0);
export const RULE = rgb(0.72, 0.72, 0.72);

/*
 * These print on a mono office laser, so every tone here has to survive as
 * grey — nothing in either document may depend on colour to be readable.
 *
 * `MUTED` is doing as much work as the bold face: dropping labels to 45% grey
 * is what lets a value read as the primary thing on its line without having to
 * grow. `ZEBRA` and `BAND` sit light enough to keep black text at full
 * contrast on top of them, and light enough not to bleed on a tired toner
 * cartridge.
 */
export const MUTED = rgb(0.45, 0.45, 0.45);
export const ZEBRA = rgb(0.96, 0.96, 0.96);
export const BAND = rgb(0.93, 0.93, 0.93);

export interface Doc {
    doc: PDFDocument;
    font: PDFFont;
    locale: Locale;
    /** RTL for Arabic — every layout mirrors off this. */
    rtl: boolean;
}

export async function createDoc(locale: Locale): Promise<Doc> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    /*
     * `subset: false` embeds the whole 200KB face. Subsetting would shrink it,
     * but pdf-lib builds the subset from the strings it encodes itself — and
     * this renderer never asks pdf-lib to encode anything, it writes glyph ids
     * straight into the content stream. A subset would come out empty.
     */
    const font = await doc.embedFont(getFont().bytes, { subset: false });

    return { doc, font, locale, rtl: locale !== 'en' };
}

export function addPage(doc: Doc, size: [number, number]): PDFPage {
    return doc.doc.addPage(size);
}

export function hairline(page: PDFPage, y: number, from: number, to: number, thickness = 0.75): void {
    page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness, color: RULE });
}

/**
 * A filled block behind content — the slip's hero band, the schedule's header
 * strip and its zebra rows. pdf-lib paints in the order operators are pushed,
 * so this has to be called before whatever sits on top of it.
 */
export function band(
    page: PDFPage,
    options: { x: number; y: number; width: number; height: number; color?: ReturnType<typeof rgb> },
): void {
    page.drawRectangle({
        x: options.x,
        y: options.y,
        width: options.width,
        height: options.height,
        color: options.color ?? BAND,
    });
}

/*
 * Dates and times are formatted in the clinic's timezone with Latin digits even
 * in Arabic (`-u-nu-latn`). Arabic-Indic numerals would be more idiomatic, but
 * the ref code and the QR URL are Latin, and a slip whose time is in one digit
 * system and whose ref is in another is harder to cross-check at the desk.
 */

export function formatDate(instant: string, timezone: string, locale: Locale): string {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn', {
        timeZone: timezone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(new Date(instant));
}

export function formatTime(instant: string, timezone: string, locale: Locale): string {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(instant));
}

/**
 * The "printed at" stamp in the footers. Numeric rather than the long form
 * `formatDate` gives, because this is provenance for a sheet someone is
 * holding — it answers "is this the reprint or the old one" and nothing else,
 * and it should not compete with the appointment date above it.
 */
export function formatStamp(instant: string, timezone: string, locale: Locale): string {
    const formatted = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn', {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(instant));

    /*
     * Arabic locales sprinkle U+200F (RIGHT-TO-LEFT MARK) between the parts of
     * a numeric date — `15‏/08‏/2026`. That is a hint for a consumer with no
     * bidi algorithm of its own, and this renderer is the opposite of that: it
     * runs the real algorithm and wraps the stamp in explicit isolates. Left
     * in, each mark opens an RTL run inside that isolate and the date comes out
     * as `2026/08/` with the day shuffled to the far end.
     *
     * Only the numeric formats do this — the long form `formatDate` uses month
     * names, which need no separators to disambiguate.
     */
    return formatted.replace(/[‎‏]/g, '');
}
