import type { Locale } from '@mawid/shared';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import { getFont } from './font.ts';

/** Points. A5 for a slip, A4 for the day schedule. */
export const A5: [number, number] = [420, 595];
export const A4: [number, number] = [595, 842];

export const MARGIN = 32;
export const INK = rgb(0, 0, 0);
export const RULE = rgb(0.72, 0.72, 0.72);

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
