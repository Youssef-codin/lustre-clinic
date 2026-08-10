/**
 * `primary` is an ink fill, not blue (Component Inventory §3.1); `accent` is the
 * handful of places that really are blue-filled, and `inverse` a white fill on
 * the black chair card. `loading` is a hard requirement: every write crosses
 * Tailscale to the clinic PC, and a button that looks idle mid-flight gets
 * tapped again — a second tap on Book is a second booking. The label stays
 * mounted and keeps its width while loading; `pressLockMs` covers the frame
 * between the finger going down and the caller's state flipping.
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
    whatsapp: color.inverse,
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
    disabled: { opacity: 0.32 },
});
