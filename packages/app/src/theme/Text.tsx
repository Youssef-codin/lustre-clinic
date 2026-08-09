import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

/**
 * The type ramp. A screen picks a variant; it never picks a size, a line height
 * or a family. Adding a size means adding it to `fontSize` in tailwind.config.js
 * and giving it a name here.
 */
export type TextVariant =
    | 'display' // money hero figure
    | 'title' // screen h1
    | 'title2'
    | 'title3'
    | 'headline' // card titles, row primaries
    | 'body' // default
    | 'callout'
    | 'subhead' // row secondaries
    | 'footnote'
    | 'caption'
    | 'figure' // large numeric field — mono
    | 'amount' // prices and row amounts — mono
    | 'eyebrow' // uppercase tracked section label — mono
    | 'tag'; // uppercase tracked tag — mono

export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export type TextTone = 'ink' | 'ink2' | 'muted' | 'accent' | 'success' | 'danger' | 'wa' | 'inverse';

type Script = 'latin' | 'mono' | 'arabic';

// Every class string below is written out literally. NativeWind compiles the
// stylesheet from what it can see in the source, so a class assembled at runtime
// from fragments would resolve to nothing.
const SIZE: Record<TextVariant, string> = {
    display: 'text-display',
    title: 'text-title',
    title2: 'text-title2',
    title3: 'text-title3',
    headline: 'text-headline',
    body: 'text-body',
    callout: 'text-callout',
    subhead: 'text-subhead',
    footnote: 'text-footnote',
    caption: 'text-caption',
    figure: 'text-figure',
    amount: 'text-amount',
    eyebrow: 'text-eyebrow uppercase',
    tag: 'text-tag uppercase',
};

// Variants that are mono by nature — numerals, eyebrows and tags stay in DM Mono
// even inside an Arabic screen, because it has no Arabic-Indic coverage and
// swapping the face would break tabular alignment (Component Inventory §7.11).
const MONO_VARIANTS: ReadonlySet<TextVariant> = new Set<TextVariant>(['figure', 'amount', 'eyebrow', 'tag']);

const DEFAULT_WEIGHT: Record<TextVariant, TextWeight> = {
    display: 'bold',
    title: 'bold',
    title2: 'bold',
    title3: 'semibold',
    headline: 'semibold',
    body: 'regular',
    callout: 'regular',
    subhead: 'regular',
    footnote: 'regular',
    caption: 'regular',
    figure: 'medium',
    amount: 'medium',
    eyebrow: 'medium',
    tag: 'medium',
};

const FAMILY: Record<Script, Record<TextWeight, string>> = {
    latin: {
        regular: 'font-sans',
        medium: 'font-sans-medium',
        semibold: 'font-sans-semibold',
        bold: 'font-sans-bold',
    },
    arabic: {
        regular: 'font-ar',
        medium: 'font-ar-medium',
        semibold: 'font-ar-semibold',
        bold: 'font-ar-bold',
    },
    // DM Mono ships 400 and 500 only; heavier weights round down to 500.
    mono: {
        regular: 'font-mono',
        medium: 'font-mono-medium',
        semibold: 'font-mono-medium',
        bold: 'font-mono-medium',
    },
};

const TONE: Record<TextTone, string> = {
    ink: 'text-ink',
    ink2: 'text-ink-2',
    muted: 'text-muted',
    accent: 'text-accent',
    success: 'text-success',
    danger: 'text-danger',
    wa: 'text-wa',
    inverse: 'text-white',
};

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/**
 * Per-string script detection (Component Inventory §6). A clinic holds Arabic and
 * Latin question labels in one list, so the face is chosen per string rather than
 * per screen — an Arabic label gets Noto Naskh even on an English screen.
 */
function containsArabic(node: React.ReactNode): boolean {
    if (typeof node === 'string') return ARABIC.test(node);
    if (typeof node === 'number') return false;
    if (Array.isArray(node)) return node.some(containsArabic);
    return false;
}

export type TextProps = RNTextProps & {
    variant?: TextVariant;
    weight?: TextWeight;
    tone?: TextTone;
    /** Force the face instead of detecting it from the string. */
    script?: Script;
};

export function Text({
    variant = 'body',
    weight,
    tone = 'ink',
    script,
    className,
    children,
    ...rest
}: TextProps) {
    const resolvedScript: Script =
        script ?? (MONO_VARIANTS.has(variant) ? 'mono' : containsArabic(children) ? 'arabic' : 'latin');

    const resolvedWeight = weight ?? DEFAULT_WEIGHT[variant];

    return (
        <RNText
            className={[SIZE[variant], FAMILY[resolvedScript][resolvedWeight], TONE[tone], className]
                .filter(Boolean)
                .join(' ')}
            {...rest}
        >
            {children}
        </RNText>
    );
}
