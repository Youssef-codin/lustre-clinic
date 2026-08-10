import { Pressable, StyleSheet, View } from 'react-native';
import { border, color, radius, size, space, Text } from '../../theme';

/**
 * The app's one piece of global navigation (Component Inventory §5 —
 * `domain/BottomTabBar`). Four clusters, always all four: the role is a device
 * preference and not a permission (§1, §6), so hiding a tab from the secretary
 * would only teach the phone a boundary the server does not have.
 *
 * Glyph plus label, both in the same tone, because the glyphs are typographic
 * rather than drawn and a glyph alone would not be readable as "Money". The
 * active tab is `ink` on a `surface2` pill; the rest are `muted`. No accent —
 * §3.1 scopes the blue to the FAB.
 */

export type TabKey = 'day' | 'patients' | 'money' | 'settings';

export type BottomTabBarProps = {
    active: TabKey;
    onChange: (tab: TabKey) => void;
};

const TABS: { key: TabKey; glyph: string; label: string }[] = [
    { key: 'day', glyph: '◷', label: 'Day' },
    { key: 'patients', glyph: '☺', label: 'Patients' },
    { key: 'money', glyph: '◈', label: 'Money' },
    { key: 'settings', glyph: '⚙', label: 'Settings' },
];

export function BottomTabBar({ active, onChange }: BottomTabBarProps) {
    return (
        <View style={styles.bar} testID="tab-bar">
            {TABS.map((tab) => {
                const selected = tab.key === active;
                return (
                    <Pressable
                        key={tab.key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        accessibilityLabel={tab.label}
                        onPress={() => onChange(tab.key)}
                        style={({ pressed }) => [
                            styles.tab,
                            selected && styles.tabActive,
                            pressed && !selected && styles.tabPressed,
                        ]}
                        testID={`tab-${tab.key}`}
                    >
                        <Text variant="headline" tone={selected ? 'ink' : 'muted'}>
                            {tab.glyph}
                        </Text>
                        <Text variant="caption" tone={selected ? 'ink' : 'muted'}>
                            {tab.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        position: 'absolute',
        start: 0,
        end: 0,
        bottom: 0,
        height: size.nav,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        paddingHorizontal: space[3],
        paddingBottom: space[3],
        backgroundColor: color.surface,
        borderTopWidth: border.hair,
        borderTopColor: color.line,
    },
    tab: {
        flex: 1,
        minHeight: size.row,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[0.5],
        paddingVertical: space[1.5],
        borderRadius: radius.xl,
    },
    tabActive: { backgroundColor: color.surface2 },
    tabPressed: { opacity: 0.6 },
});
