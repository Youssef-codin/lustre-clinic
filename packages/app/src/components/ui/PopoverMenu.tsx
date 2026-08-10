import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { color, radius, shadow, size, space, Text } from '../../theme';
import { duration, easing } from './motion';
import { Scrim } from './Scrim';
import { useReducedMotion } from './useReducedMotion';

export type MenuAnchor = {
    /** Distance from the top of the window to the menu's top edge. */
    top: number;
    /** Distance from the inline end of the window — mirrors in Arabic. */
    end?: number;
    /**
     * Distance from the inline start instead. For a trigger in the start
     * gutter: anchored by its end, the menu is pushed most of a screen width
     * past the edge and its rows are clipped away.
     */
    start?: number;
};

export type MenuItem = {
    key: string;
    label: string;
    icon?: ReactNode;
    onPress: () => void;
    /** Red label, and it sits under a divider. */
    danger?: boolean;
    disabled?: boolean;
};

export type PopoverMenuProps = {
    visible: boolean;
    onClose: () => void;
    items: readonly MenuItem[];
    /** Where the overflow button is. Defaults to under a top bar in the end gutter. */
    anchor?: MenuAnchor;
    accessibilityLabel?: string;
    testID?: string;
};

/**
 * The overflow menu — anchored under the trailing icon button, scaling .94 -> 1.
 *
 * The anchor is passed in rather than measured: the trigger is a top-bar button
 * at a fixed inset on every screen that has one, and measuring it would make the
 * menu depend on layout timing for no gain.
 */
export function PopoverMenu({
    visible,
    onClose,
    items,
    anchor,
    accessibilityLabel,
    testID,
}: PopoverMenuProps) {
    return (
        <MenuSurface
            visible={visible}
            onClose={onClose}
            anchor={anchor}
            accessibilityLabel={accessibilityLabel}
            testID={testID}
        >
            {items.map((item, index) => (
                <View key={item.key}>
                    {item.danger && index > 0 ? <View style={styles.divider} /> : null}
                    <Pressable
                        accessibilityRole="menuitem"
                        accessibilityState={{ disabled: item.disabled }}
                        disabled={item.disabled}
                        onPress={() => {
                            onClose();
                            item.onPress();
                        }}
                        style={({ pressed }) => [
                            styles.item,
                            pressed && styles.pressed,
                            item.disabled && styles.disabled,
                        ]}
                    >
                        {item.icon}
                        <Text variant="body" tone={item.danger ? 'danger' : 'ink'}>
                            {item.label}
                        </Text>
                    </Pressable>
                </View>
            ))}
        </MenuSurface>
    );
}

export type MenuSurfaceProps = {
    visible: boolean;
    onClose: () => void;
    anchor?: MenuAnchor;
    children: ReactNode;
    accessibilityLabel?: string;
    testID?: string;
};

/** The floating card itself. Shared with DropdownMenu. */
export function MenuSurface({
    visible,
    onClose,
    anchor,
    children,
    accessibilityLabel,
    testID,
}: MenuSurfaceProps) {
    const progress = useRef(new Animated.Value(0)).current;
    const [mounted, setMounted] = useState(visible);
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        if (visible) setMounted(true);
        const animation = Animated.timing(progress, {
            toValue: visible ? 1 : 0,
            duration: reducedMotion ? 0 : duration.popover,
            easing: easing.standard,
            useNativeDriver: true,
        });
        animation.start(({ finished }) => {
            if (finished && !visible) setMounted(false);
        });
        return () => animation.stop();
    }, [visible, progress, reducedMotion]);

    if (!mounted) return null;

    const top = anchor?.top ?? space[12];
    // One edge or the other, never both — two would stretch the surface across
    // the window rather than sit it under its trigger.
    const inline =
        anchor?.start !== undefined ? { start: anchor.start } : { end: anchor?.end ?? size.gutter };

    return (
        <Modal visible transparent animationType="none" onRequestClose={onClose} testID={testID}>
            <Scrim opacity={progress} onPress={onClose} />
            <Animated.View
                accessibilityRole="menu"
                accessibilityLabel={accessibilityLabel}
                style={[
                    styles.surface,
                    { top, ...inline },
                    {
                        opacity: progress,
                        transform: [
                            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                        ],
                    },
                ]}
            >
                {children}
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    surface: {
        position: 'absolute',
        minWidth: 200,
        paddingVertical: space[1],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
        boxShadow: shadow.card,
        overflow: 'hidden',
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        minHeight: size.row,
        paddingHorizontal: space[4],
    },
    divider: { height: 1, backgroundColor: color.hair, marginVertical: space[1] },
    pressed: { backgroundColor: color.surface2 },
    disabled: { opacity: 0.32 },
});
