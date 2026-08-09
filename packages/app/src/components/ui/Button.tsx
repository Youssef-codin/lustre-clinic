import type { ReactNode } from 'react';
import { useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { TextTone } from '../../theme';
import { border, color, radius, shadow, size, space, Text } from '../../theme';

/**
 * `primary` is an ink fill, not a blue one. Component Inventory §3.1 scopes the
 * blue to "FAB, progress fill, links, dashed add buttons" and System B records
 * `--fg #111114` as "text, *primary fill*" — the designs draw solid black
 * primaries throughout. §7.1's summary widens the blue to "buttons", which is
 * the one place it overshoots the inventory it is summarising.
 *
 * `accent` exists for the handful of places that really are blue-filled.
 */
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'text' | 'danger';
export type ButtonSize = 'lg' | 'md';

export type ButtonProps = {
    label: string;
    onPress?: () => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    /**
     * Shows a spinner in place of the label and refuses presses. Every write in
     * this app crosses Tailscale to a PC in the clinic, so the gap between the
     * tap and the server answering is visible — and a button that looks idle
     * during it gets tapped again. The second tap on Book is a second booking.
     */
    loading?: boolean;
    disabled?: boolean;
    /** Rendered before the label. Sized by the caller. */
    icon?: ReactNode;
    /** Stretch to the container's inline size. Primary actions usually do. */
    block?: boolean;
    /**
     * Ignore a repeat press landing within this window. `loading` is the real
     * defence; this covers the frame between the finger going down and the
     * caller's state actually flipping. 0 disables it.
     */
    pressLockMs?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

const LABEL_TONE: Record<ButtonVariant, TextTone> = {
    primary: 'inverse',
    accent: 'inverse',
    secondary: 'ink',
    ghost: 'ink',
    text: 'accent',
    danger: 'danger',
};

const SPINNER: Record<ButtonVariant, string> = {
    primary: color.inverse,
    accent: color.inverse,
    secondary: color.ink,
    ghost: color.ink,
    text: color.accent,
    danger: color.danger,
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
    style,
    testID,
}: ButtonProps) {
    const lockedUntil = useRef(0);
    const inert = disabled || loading;

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
                disabled && styles.disabled,
                style,
            ]}
        >
            {/* The label stays mounted and keeps its width while loading, so the
                button does not resize under the finger mid-press. */}
            <View style={[styles.content, loading && styles.hidden]}>
                {icon}
                <Text
                    variant={sizeProp === 'lg' ? 'headline' : 'callout'}
                    weight="semibold"
                    tone={LABEL_TONE[variant]}
                >
                    {label}
                </Text>
            </View>

            {loading && (
                <View style={styles.spinner} pointerEvents="none">
                    <ActivityIndicator size="small" color={SPINNER[variant]} />
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
    secondary: { borderWidth: border.thick, borderColor: color.ink, backgroundColor: color.surface },
    ghost: {
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
        boxShadow: shadow.pill,
    },
    text: { paddingHorizontal: space[2], minHeight: size.row },
    danger: { borderWidth: border.thick, borderColor: color.danger, backgroundColor: color.surface },

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
    disabled: { opacity: 0.32 },
});
