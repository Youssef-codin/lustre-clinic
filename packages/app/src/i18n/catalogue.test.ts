/**
 * Every English string the app shows has an Arabic one behind it.
 *
 * The sweep that added the catalogue is only half the work: the half that rots
 * is the next screen, written in English, shipping a row that stays English
 * when the toggle is flipped. Nothing else catches that — `localizeCopy` falls
 * back to the English key by design, so a missing entry is silent at runtime
 * and invisible in review. This is the same trick `theme/tokens.test.ts` and
 * `components/ui/boundaries.test.ts` use: read the source and assert about it.
 *
 * Two shapes are scanned, because copy reaches the user two ways:
 *
 * - `t('…')` — a screen localizing its own string.
 * - A copy prop on a primitive that localizes for its callers, such as
 *   `<Button label="Save" />`. `COPY_PROPS` is that list, and it has to be a
 *   list: `title` on a `Sheet` is copy, `name` on anything is a patient.
 * - The *children* of a primitive that localizes them rather than a prop —
 *   `<SectionLabel>BOOKED ANYWAY</SectionLabel>`. `COPY_CHILDREN` is that
 *   list. This is the shape the first sweep missed: the eyebrow over the
 *   closed day's appointments stayed English because nothing looked here.
 *
 * Only string literals are checked. A value built at runtime — a branch name, a
 * formatted total, an already-localized `ERROR_CODE` sentence — cannot be
 * checked here and is not meant to be.
 */
import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { COPY_AR } from '@lustre/shared';
import { Glob } from 'bun';

const SRC = path.resolve(import.meta.dir, '..');

/** Props whose value is copy the primitive itself puts through `t`. */
const COPY_PROPS = [
    'label',
    'title',
    'subtitle',
    'sheetTitle',
    'placeholder',
    'hint',
    'message',
    'actionLabel',
    'confirmLabel',
    'cancelLabel',
    'accessibilityLabel',
    // `Placeholder`'s, which draws it through `t`.
    'text',
];

/** Primitives that put their own children through `t`. */
const COPY_CHILDREN = ['SectionLabel', 'Tag', 'Callout'];

const T_CALL = /\bt\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;
const PROP = new RegExp(`\\b(?:${COPY_PROPS.join('|')})=(?:"([^"]+)"|\\{'([^']+)'\\})`, 'g');
// The opening tag may carry a JSX prop — `icon={<InfoIcon size={16} />}` —
// so its attributes are matched as anything outside braces or a brace pair
// nested one deep, not as "anything but `<`". The first form missed the
// inactive-branch notice for exactly that prop.
const CHILD = new RegExp(
    `<(${COPY_CHILDREN.join('|')})\\b(?:[^<>{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*>\\s*([A-Za-z][^<>{}]*?)\\s*</\\1>`,
    'g',
);

/**
 * `screens/dev/` is the component gallery, which is not in the production
 * navigator and is read by whoever is building a primitive, in English.
 */
const SKIP = ['screens/dev/'];

function unquoted(literal: string): string {
    return literal.replace(/\\(['"\\])/g, '$1');
}

async function sources(): Promise<{ file: string; text: string }[]> {
    const glob = new Glob('**/*.{ts,tsx}');
    const out: { file: string; text: string }[] = [];
    for await (const file of glob.scan({ cwd: SRC })) {
        if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
        if (SKIP.some((skipped) => file.startsWith(skipped))) continue;
        out.push({ file, text: await Bun.file(path.join(SRC, file)).text() });
    }
    return out;
}

/**
 * A `{day}` slot is filled in at runtime and is part of the key, so it is the
 * words around it that decide whether a literal is copy at all. That keeps
 * `testID`s, icon names and `100.x` out of the catalogue.
 */
function isCopy(value: string): boolean {
    return /[A-Za-z]/.test(value.replace(/\{\w+\}/g, ''));
}

describe('copy catalogue', () => {
    it('has an Arabic entry for every English literal the app shows', async () => {
        const missing = new Set<string>();

        for (const { file, text } of await sources()) {
            for (const pattern of [T_CALL, PROP, CHILD]) {
                pattern.lastIndex = 0;
                for (const match of text.matchAll(pattern)) {
                    const raw = pattern === CHILD ? match[2] : (match[2] ?? match[1] ?? match[3]);
                    if (raw === undefined) continue;
                    const value = unquoted(raw.replace(/\s+/g, ' ').trim());
                    if (!isCopy(value)) continue;
                    if (value in COPY_AR) continue;
                    missing.add(`${value}  (${file})`);
                }
            }
        }

        expect([...missing].sort()).toEqual([]);
    });
});
