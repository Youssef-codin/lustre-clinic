import bidiFactory from 'bidi-js';
import { Direction, Buffer as HbBuffer, shape } from 'harfbuzzjs';
import {
    beginText,
    endText,
    LineJoinStyle,
    type PDFFont,
    PDFHexString,
    type PDFPage,
    popGraphicsState,
    pushGraphicsState,
    rgb,
    setFillingColor,
    setFontAndSize,
    setLineJoin,
    setLineWidth,
    setStrokingColor,
    setTextMatrix,
    setTextRenderingMode,
    showText,
    TextRenderingMode,
} from 'pdf-lib';
import { getFont } from './font.ts';

/**
 * Arabic needs two things no PDF library does on its own:
 *
 *  1. **Shaping** — Arabic letters change form by position and some pairs merge
 *     into one glyph. Drawing the code points as-is prints disconnected letters,
 *     which is what `pdf-lib`'s own text drawing produces.
 *  2. **Bidi reordering** — a phone number inside an Arabic sentence runs
 *     left-to-right while the sentence runs right-to-left.
 *
 * So text goes: bidi (levels + visual order) → harfbuzz (glyphs + positions) →
 * glyphs drawn one at a time into the content stream. Everything downstream of
 * this module deals in positioned glyphs, not strings.
 */

const bidi = bidiFactory();

export type BaseDirection = 'rtl' | 'ltr';

/**
 * Wraps a value that must read left-to-right inside an Arabic line — a ref
 * code, a phone number, a time.
 *
 * Without this, bidi splits `030826-01` at the hyphen and lays the two numbers
 * out right-to-left, printing `01-030826`. The slip's ref is typed back in by
 * hand and encoded in its QR, so it has to appear exactly as stored. U+2066
 * (LEFT-TO-RIGHT ISOLATE) and U+2069 (POP DIRECTIONAL ISOLATE) say "this span
 * is one LTR unit" without affecting the direction of the text around it.
 */
export function ltr(value: string): string {
    return `⁦${value}⁩`;
}

interface PositionedGlyph {
    glyphId: number;
    /** Offsets and advance in font units. */
    xOffset: number;
    yOffset: number;
    xAdvance: number;
}

export interface ShapedText {
    glyphs: PositionedGlyph[];
    /** Total advance, in font units. */
    width: number;
}

interface LevelRun {
    start: number;
    end: number;
    level: number;
}

/** Maximal spans of equal embedding level, in logical order. */
function levelRuns(levels: Uint8Array, length: number): LevelRun[] {
    const runs: LevelRun[] = [];
    let start = 0;

    for (let i = 1; i <= length; i += 1) {
        if (i === length || levels[i] !== levels[start]) {
            runs.push({ start, end: i, level: levels[start] ?? 0 });
            start = i;
        }
    }

    return runs;
}

/**
 * Unicode bidi rule L2: from the highest level down to the lowest odd level,
 * reverse any contiguous stretch of runs at or above that level. That is what
 * turns logical order into the order things are drawn on the page.
 */
function toVisualOrder(runs: LevelRun[]): LevelRun[] {
    const ordered = [...runs];
    if (ordered.length === 0) return ordered;

    const levels = ordered.map((r) => r.level);
    const highest = Math.max(...levels);
    const lowestOdd = Math.min(...levels.filter((l) => l % 2 === 1).concat(highest + 1));

    for (let level = highest; level >= lowestOdd; level -= 1) {
        for (let i = 0; i < ordered.length; i += 1) {
            if ((ordered[i]?.level ?? 0) < level) continue;

            let j = i;
            while (j + 1 < ordered.length && (ordered[j + 1]?.level ?? 0) >= level) j += 1;
            const slice = ordered.slice(i, j + 1).reverse();
            ordered.splice(i, slice.length, ...slice);
            i = j;
        }
    }

    return ordered;
}

/** Shapes one same-direction run. Harfbuzz takes logical order and returns visual. */
function shapeRun(text: string, rtl: boolean): PositionedGlyph[] {
    const { font } = getFont();
    const buffer = new HbBuffer();

    buffer.addText(text);
    buffer.setDirection(rtl ? Direction.RTL : Direction.LTR);
    buffer.setScript(rtl ? 'Arab' : 'Latn');
    buffer.setLanguage(rtl ? 'ar' : 'en');
    shape(font, buffer);

    // After shaping, `codepoint` holds a glyph index rather than a character.
    return buffer.getGlyphInfosAndPositions().map((g) => ({
        glyphId: g.codepoint,
        xOffset: g.xOffset ?? 0,
        yOffset: g.yOffset ?? 0,
        xAdvance: g.xAdvance ?? 0,
    }));
}

/**
 * Shapes a whole string, mixed directions included. The result is in drawing
 * order: walk it left to right, advancing by each glyph.
 */
export function shapeText(text: string, base: BaseDirection = 'rtl'): ShapedText {
    if (text.length === 0) return { glyphs: [], width: 0 };

    const { levels } = bidi.getEmbeddingLevels(text, base);
    const runs = toVisualOrder(levelRuns(levels, text.length));

    const glyphs: PositionedGlyph[] = [];
    for (const run of runs) {
        glyphs.push(...shapeRun(text.slice(run.start, run.end), run.level % 2 === 1));
    }

    return { glyphs, width: glyphs.reduce((sum, g) => sum + g.xAdvance, 0) };
}

/**
 * Width in points, for laying out and right-aligning without drawing.
 *
 * Bold needs no separate measurement: it is the same face stroked, so the
 * advances are identical and truncation stays exact.
 */
export function measureText(text: string, size: number, base: BaseDirection = 'rtl'): number {
    return (shapeText(text, base).width * size) / getFont().upem;
}

export interface DrawOptions {
    x: number;
    y: number;
    size: number;
    font: PDFFont;
    base?: BaseDirection;
    color?: ReturnType<typeof rgb>;
    /** Stroke-emboldened. See the note on synthetic bold above. */
    bold?: boolean;
}

/**
 * Emboldening stroke, as a fraction of the point size. Enough to read as a
 * different weight across a desk, low enough that a 9pt Arabic label does not
 * fill its counters in on a laser.
 */
const BOLD_STROKE = 0.028;

/**
 * Draws shaped glyphs at `x, y` (the text baseline's left edge).
 *
 * Glyph ids go into the content stream directly as two-byte codes, which works
 * because `pdf-lib` embeds a custom font as Type0/Identity-H — in that encoding
 * the character code *is* the glyph id. Each glyph is positioned individually
 * so harfbuzz's mark placement (the vowel sitting above a letter) survives.
 *
 * `bold` strokes the glyph outline in the fill colour rather than swapping in a
 * bold face, because there is no bold face to swap to — see `font.ts`. It also
 * happens to be the safer of the two: the advances are the Regular's, so a
 * bold value measures exactly as it draws and cannot overrun the column it was
 * truncated to fit.
 */
export function drawShapedText(page: PDFPage, text: string, options: DrawOptions): number {
    const { x, y, size, font, base = 'rtl', color = rgb(0, 0, 0), bold = false } = options;
    const { upem } = getFont();
    const { glyphs, width } = shapeText(text, base);

    // `newFontDictionary` hands back a PDFName; `setFontAndSize` wants the bare
    // key and re-wraps it, so the leading slash comes off.
    const fontKey = page.node.newFontDictionary(font.name, font.ref).asString().slice(1);
    const operators = [pushGraphicsState(), setFillingColor(color)];

    if (bold) {
        operators.push(
            setStrokingColor(color),
            setLineWidth(size * BOLD_STROKE),
            // Naskh is full of sharp joins; mitring them spikes the corners.
            setLineJoin(LineJoinStyle.Round),
        );
    }

    operators.push(beginText(), setFontAndSize(fontKey, size));

    if (bold) operators.push(setTextRenderingMode(TextRenderingMode.FillAndOutline));

    let penX = x;
    for (const glyph of glyphs) {
        const gx = penX + (glyph.xOffset * size) / upem;
        const gy = y + (glyph.yOffset * size) / upem;

        operators.push(
            setTextMatrix(1, 0, 0, 1, gx, gy),
            showText(PDFHexString.of(glyph.glyphId.toString(16).padStart(4, '0'))),
        );

        penX += (glyph.xAdvance * size) / upem;
    }

    operators.push(endText(), popGraphicsState());
    page.pushOperators(...operators);

    return (width * size) / upem;
}

/** Right-aligns to `right` — the default for Arabic labels and values. */
export function drawShapedTextRight(
    page: PDFPage,
    text: string,
    options: Omit<DrawOptions, 'x'> & { right: number },
): number {
    const width = measureText(text, options.size, options.base);
    return drawShapedText(page, text, { ...options, x: options.right - width });
}

/**
 * Trims to fit a column, with an ellipsis. Re-measures after every cut instead
 * of estimating from character count: Arabic letters change width with their
 * joining form, so dropping one character can shrink the line by more or less
 * than that character's own width.
 */
export function truncateToWidth(
    text: string,
    size: number,
    maxWidth: number,
    base: BaseDirection = 'rtl',
): string {
    if (measureText(text, size, base) <= maxWidth) return text;

    let cut = text.length;
    while (cut > 1) {
        cut -= 1;
        const candidate = `${text.slice(0, cut).trimEnd()}…`;
        if (measureText(candidate, size, base) <= maxWidth) return candidate;
    }

    return '…';
}

/**
 * Greedy word wrap. Measures with the real shaper rather than by character
 * count, because an Arabic glyph's width has little to do with its code point.
 */
export function wrapText(
    text: string,
    size: number,
    maxWidth: number,
    base: BaseDirection = 'rtl',
): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return [];

    const lines: string[] = [];
    let line = '';

    for (const word of words) {
        const candidate = line.length === 0 ? word : `${line} ${word}`;
        if (measureText(candidate, size, base) <= maxWidth || line.length === 0) {
            line = candidate;
        } else {
            lines.push(line);
            line = word;
        }
    }

    if (line.length > 0) lines.push(line);
    return lines;
}
