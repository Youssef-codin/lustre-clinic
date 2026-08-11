/**
 * Icon-only button. The paint box can be under 44 (the designs draw 30–34px
 * circles), so the touch target is extended past the paint rather than growing
 * it. Box sizes by variant: 34 top-bar/row, 40 WhatsApp/call, 32 calendar nav,
 * 30 kill/del/option dismiss.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';
import { color, radius, space } from '../../theme';

export type IconButtonVariant = 'circle' | 'filled' | 'square' | 'bare';
export type IconButtonTone = 'ink' | 'muted' | 'accent' | 'danger' | 'wa';

export type IconButtonProps = {
    accessibilityLabel: string;
    icon: ReactNode;
    onPress?: () => void;
    variant?: IconButtonVariant;
    tone?: IconButtonTone;
    disabled?: boolean;
    size?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

const BOX: Record<IconButtonVariant, number> = {
    circle: 34,
    filled: 40,
    square: 32,
    bare: 30,
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
