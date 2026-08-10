import { Pressable, StyleSheet } from 'react-native';
import { color, size, space, Text } from '../../theme';
import type { MenuAnchor } from './PopoverMenu';
import { MenuSurface } from './PopoverMenu';

export type DropdownOption<T extends string> = { value: T; label: string };

export type DropdownMenuProps<T extends string> = {
    visible: boolean;
    onClose: () => void;
    options: readonly DropdownOption<T>[];
    value: T;
    onChange: (value: T) => void;
    anchor?: MenuAnchor;
    accessibilityLabel?: string;
    testID?: string;
};

export function DropdownMenu<T extends string>({
    visible,
    onClose,
    options,
    value,
    onChange,
    anchor,
    accessibilityLabel,
    testID,
}: DropdownMenuProps<T>) {
    return (
        <MenuSurface
            visible={visible}
            onClose={onClose}
            anchor={anchor}
            accessibilityLabel={accessibilityLabel}
            testID={testID}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        accessibilityRole="menuitem"
                        accessibilityState={{ checked: selected, selected }}
                        onPress={() => {
                            onClose();
                            if (!selected) onChange(option.value);
                        }}
                        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                    >
                        <Text variant="body" weight={selected ? 'semibold' : 'regular'} style={styles.label}>
                            {option.label}
                        </Text>
                        {selected ? (
                            <Text variant="body" tone="accent">
                                {'✓'}
                            </Text>
                        ) : null}
                    </Pressable>
                );
            })}
        </MenuSurface>
    );
}

const styles = StyleSheet.create({
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row,
        paddingHorizontal: space[4],
    },
    label: { flex: 1 },
    pressed: { backgroundColor: color.surface2 },
});
