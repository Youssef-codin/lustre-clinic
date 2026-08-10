import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';
import { color, font, type } from './tokens';

// The type ramp: a screen picks a variant, never a size, line height or family
// (adding a size means adding it to `type` in tokens.ts and naming it here).
// The face is chosen per string — a clinic holds Arabic and Latin labels in one
// list, so an Arabic label gets Noto Naskh even on an English screen. Mono
// variants (figure, amount, eyebrow, tag) stay in DM Mono even inside Arabic:
// it has no Arabic-Indic coverage and swapping faces would break tabular
// alignment (§7.11). The `live` tone is legible on `ink` only — never on a
// white ground.
export type TextVariant = keyof typeof type;

export type TextWeight = keyof typeof font.sans;

export type TextTone =
    | 'ink'
    | 'ink2'
    | 'muted'
    | 'accent'
    | 'success'
    | 'due'
    | 'danger'
    | 'wa'
    | 'inverse'
    | 'live';

type Script = keyof typeof font;

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
    live: color.live,
};

const styles = StyleSheet.create({
    uppercase: { textTransform: 'uppercase' },
});

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

export function containsArabic(node: React.ReactNode): boolean {
    if (typeof node === 'string') return ARABIC.test(node);
    if (Array.isArray(node)) return node.some(containsArabic);
    return false;
}

export type TextProps = RNTextProps & {
    variant?: TextVariant;
    weight?: TextWeight;
    tone?: TextTone;
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
