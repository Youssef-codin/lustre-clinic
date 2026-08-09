import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';
import { color, font, type } from './tokens';

/**
 * The type ramp. A screen picks a variant; it never picks a size, a line height
 * or a family. Adding a size means adding it to `type` in tokens.ts and giving
 * it a name here.
 */
export type TextVariant = keyof typeof type;

export type TextWeight = keyof typeof font.sans;

export type TextTone = 'ink' | 'ink2' | 'muted' | 'accent' | 'success' | 'due' | 'danger' | 'wa' | 'inverse';

type Script = keyof typeof font;

// Variants that are mono by nature — numerals, eyebrows and tags stay in DM Mono
// even inside an Arabic screen, because it has no Arabic-Indic coverage and
// swapping the face would break tabular alignment (Component Inventory §7.11).
const MONO_VARIANTS: ReadonlySet<TextVariant> = new Set<TextVariant>(['figure', 'amount', 'eyebrow', 'tag']);

const UPPERCASE_VARIANTS: ReadonlySet<TextVariant> = new Set<TextVariant>(['eyebrow', 'tag']);

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

const TONE: Record<TextTone, string> = {
    ink: color.ink,
    ink2: color.ink2,
    muted: color.muted,
    accent: color.accent,
    success: color.success,
    due: color.due,
    danger: color.danger,
    wa: color.wa,
    inverse: color.inverse,
};

const styles = StyleSheet.create({
    uppercase: { textTransform: 'uppercase' },
});

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/**
 * Per-string script detection (Component Inventory §6). A clinic holds Arabic and
 * Latin question labels in one list, so the face is chosen per string rather than
 * per screen — an Arabic label gets Noto Naskh even on an English screen.
 */
function containsArabic(node: React.ReactNode): boolean {
    if (typeof node === 'string') return ARABIC.test(node);
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
    style,
    children,
    ...rest
}: TextProps) {
    const resolvedScript: Script =
        script ?? (MONO_VARIANTS.has(variant) ? 'mono' : containsArabic(children) ? 'arabic' : 'sans');

    return (
        <RNText
            style={[
                type[variant],
                { fontFamily: font[resolvedScript][weight ?? DEFAULT_WEIGHT[variant]], color: TONE[tone] },
                UPPERCASE_VARIANTS.has(variant) && styles.uppercase,
                style,
            ]}
            {...rest}
        >
            {children}
        </RNText>
    );
}
