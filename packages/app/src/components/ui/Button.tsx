/**
 * `primary` is an ink fill, not blue (Component Inventory §3.1); `accent` is the
 * handful of places that really are blue-filled, and `inverse` a white fill on
 * the black chair card. `text` is the quiet affirmative — Try again, Answer —
 * and stays blue; `dangerText` is its destructive twin at the same weight, so a
 * step that undoes something never wears the colour of Try again. `loading` is
 * a hard requirement: every write crosses
 * Tailscale to the clinic PC, and a button that looks idle mid-flight gets
 * tapped again — a second tap on Book is a second booking. The label stays
 * mounted and keeps its width while loading; `pressLockMs` covers the frame
 * between the finger going down and the caller's state flipping.
 *
 * `disabled` is two colours rather than one opacity, and one per variant. An
 * opacity moves fill and label together, so a disabled `primary` fades an ink
 * fill and white type into the same grey and `3 required left` — the sentence
 * that says how to bring the control back — goes with it. The design draws
 * `rgba(0,0,0,.12)` under `rgba(0,0,0,.45)`: `surface2` under `muted`, where
 * the label darkens as the fill lightens. The two text variants have no fill to
 * lighten, so they only lose their colour.
 */
import type { ReactNode } from 'react';
import { useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { TextTone } from '../../theme';
import { border, color, radius, shadow, size, space, Text } from '../../theme';

export type ButtonVariant =
    | 'primary'
    | 'accent'
    | 'accentSoft'
    | 'inverse'
    | 'secondary'
    | 'ghost'
    | 'text'
    | 'danger'
    | 'dangerText'
    | 'whatsapp';
export type ButtonSize = 'lg' | 'md';

export type ButtonProps = {
    label: string;
    onPress?: () => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    disabled?: boolean;
    icon?: ReactNode;
    block?: boolean;
    pressLockMs?: number;
    /**
     * Whether `disabled` is allowed to change how the button looks. `dim` is the
     * default and is right almost everywhere: the fill lightens, the label
     * darkens, and the control reads as not yet available.
     *
     * `solid` keeps the enabled fill and label while staying just as inert. It
     * is for the one button on a screen that is always the way forward — a
     * stepper's Next, where the step above it already says what is missing, and
     * grey-ing the only action on the bar reads as the screen having nothing to
     * offer rather than as a question still open.
     */
    disabledLook?: 'dim' | 'solid';
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

const LABEL_TONE: Record<ButtonVariant, TextTone> = {
    primary: 'inverse',
    accent: 'inverse',
    accentSoft: 'accent',
    inverse: 'ink',
    secondary: 'ink',
    ghost: 'ink',
    text: 'accent',
    danger: 'danger',
    dangerText: 'danger',
    whatsapp: 'inverse',
};

const SPINNER: Record<ButtonVariant, string> = {
    primary: color.inverse,
    accent: color.inverse,
    accentSoft: color.accent,
    inverse: color.ink,
    secondary: color.ink,
    ghost: color.ink,
    text: color.accent,
    danger: color.danger,
    dangerText: color.danger,
    whatsapp: color.inverse,
};

type DisabledLook = 'disabledFilled' | 'disabledOutlined' | 'disabledBare';

const DISABLED: Record<ButtonVariant, DisabledLook> = {
    primary: 'disabledFilled',
    accent: 'disabledFilled',
    accentSoft: 'disabledFilled',
    inverse: 'disabledFilled',
    secondary: 'disabledOutlined',
    ghost: 'disabledOutlined',
    text: 'disabledBare',
    danger: 'disabledOutlined',
    dangerText: 'disabledBare',
    whatsapp: 'disabledFilled',
};

export function Button({
    label,
    onPress,
    variant = 'primary',
    size: sizeProp = 'lg',
    loading = false,
    disabled = false,
    icon,
    block = false,
    pressLockMs = 500,
    disabledLook = 'dim',
    style,
    testID,
}: ButtonProps) {
    const lockedUntil = useRef(0);
    const inert = disabled || loading;
    // Inertness and appearance are separate questions: `solid` refuses the press
    // exactly as `dim` does, and only declines to say so in the fill.
    const dimmed = disabled && disabledLook === 'dim';

    function handlePress() {
        if (inert || !onPress) return;
        const now = Date.now();
        if (now < lockedUntil.current) return;
        lockedUntil.current = now + pressLockMs;
        onPress();
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: inert, busy: loading }}
            disabled={inert}
            onPress={handlePress}
            testID={testID}
            style={({ pressed }) => [
                styles.base,
                sizeProp === 'lg' ? styles.lg : styles.md,
                styles[variant],
                block && styles.block,
                pressed && styles.pressed,
                dimmed && styles[DISABLED[variant]],
                style,
            ]}
        >
            <View style={[styles.content, loading && styles.hidden]}>
                {icon}
                <Text
                    variant={sizeProp === 'lg' ? 'headline' : 'callout'}
                    weight="semibold"
                    tone={dimmed ? 'muted' : LABEL_TONE[variant]}
                >
                    {label}
                </Text>
            </View>

            {loading && (
                <View style={styles.spinner} pointerEvents="none">
                    {/* A button can be loading and disabled at once — `ActionBar`
                        passes both to its primary. The spinner follows the label
                        onto the light fill, or a white one lands on `surface2`
                        and the button reads as doing nothing at all. */}
                    <ActivityIndicator size="small" color={dimmed ? color.muted : SPINNER[variant]} />
                </View>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: {
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: space[5],
    },
    lg: { minHeight: size.button, borderRadius: radius.full },
    md: { minHeight: size.row, borderRadius: radius.lg, paddingHorizontal: space[4] },
    block: { alignSelf: 'stretch' },

    primary: { backgroundColor: color.ink },
    accent: { backgroundColor: color.accent },
    accentSoft: { backgroundColor: color.accentSoft },
    inverse: { backgroundColor: color.surface },
    secondary: { borderWidth: border.thick, borderColor: color.outline },
    ghost: {
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
        boxShadow: shadow.pill,
    },
    text: { paddingHorizontal: space[2], minHeight: size.row },
    danger: { borderWidth: border.thick, borderColor: color.danger, backgroundColor: color.surface },
    dangerText: { paddingHorizontal: space[2], minHeight: size.row },
    whatsapp: { backgroundColor: color.wa },

    content: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    hidden: { opacity: 0 },
    spinner: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },

    pressed: { opacity: 0.72 },

    disabledFilled: { backgroundColor: color.surface2 },
    // The outlined variants keep their border, at `line` rather than at their
    // own colour: a disabled Delete drawn in `danger` red still shouts.
    disabledOutlined: { backgroundColor: color.surface2, borderColor: color.line },
    disabledBare: { backgroundColor: color.transparent },
});
