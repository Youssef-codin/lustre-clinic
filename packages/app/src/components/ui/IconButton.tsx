import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';
import { color, radius, space } from '../../theme';

export type IconButtonVariant = 'circle' | 'filled' | 'square' | 'bare';
export type IconButtonTone = 'ink' | 'muted' | 'accent' | 'danger' | 'wa';

export type IconButtonProps = {
    /** Never optional. An icon-only control is unusable without it. */
    accessibilityLabel: string;
    icon: ReactNode;
    onPress?: () => void;
    variant?: IconButtonVariant;
    tone?: IconButtonTone;
    disabled?: boolean;
    /** Overrides the variant's default box. */
    size?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

const BOX: Record<IconButtonVariant, number> = {
    circle: 34, // universal top-bar / row action
    filled: 40, // WhatsApp, call
    square: 32, // calendar nav
    bare: 30, // kill, del, option dismiss
};

const FILL: Record<IconButtonTone, string> = {
    ink: color.ink,
    muted: color.surface2,
    accent: color.accent,
    danger: color.danger,
    wa: color.wa,
};

export function IconButton({
    accessibilityLabel,
    icon,
    onPress,
    variant = 'circle',
    tone = 'ink',
    disabled = false,
    size,
    style,
    testID,
}: IconButtonProps) {
    const box = size ?? BOX[variant];

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            testID={testID}
            // The box can be under 44 — the designs draw 30–34px circles — so the
            // touch target is extended past the paint rather than growing it.
            hitSlop={Math.max(0, Math.round((44 - box) / 2))}
            style={({ pressed }) => [
                styles.base,
                { width: box, height: box },
                variant === 'square' ? styles.square : styles.round,
                variant === 'circle' && styles.outlined,
                variant === 'filled' && { backgroundColor: FILL[tone] },
                variant === 'square' && styles.outlined,
                pressed && styles.pressed,
                disabled && styles.disabled,
                style,
            ]}
        >
            {icon}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: { alignItems: 'center', justifyContent: 'center', padding: space[0.5] },
    round: { borderRadius: radius.full },
    square: { borderRadius: radius.sm },
    outlined: { borderWidth: 1, borderColor: color.line, backgroundColor: color.surface },
    pressed: { opacity: 0.6 },
    disabled: { opacity: 0.32 },
});
