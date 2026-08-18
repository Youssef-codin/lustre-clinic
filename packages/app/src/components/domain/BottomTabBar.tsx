/**
 * The app's global navigation: four items, 22px stroked icons over an 11px
 * label, the active tab in `ink` and the rest in `muted`. The bar sits in flow
 * at the bottom of the shell rather than absolutely positioned, and carries the
 * bottom safe-area inset itself — an absolute position would put the labels
 * under Android's own gesture bar.
 *
 * The fourth tab was the role — "Doctor" or "Secretary", tapped to flip it —
 * on the reasoning that the device is the account. `settings.html` settles it
 * the other way: the fourth tab is Settings, and the role is the card at the
 * top of that screen, with a sheet that says what switching changes before it
 * changes anything. A tab that silently changed what the app could do on a
 * mis-tap was the cost of the old arrangement, and it left Settings with no way
 * in at all.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { border, color, radius, size, space, Text } from '../../theme';

export type TabKey = 'day' | 'patients' | 'money' | 'settings';

export type BottomTabBarProps = {
    active: TabKey;
    onChange: (tab: TabKey) => void;
};

const ICONS: Record<TabKey, (stroke: string) => React.ReactNode> = {
    day: (stroke) => (
        <>
            <Rect x={3} y={5} width={18} height={16} rx={3} stroke={stroke} />
            <Path d="M3 10h18M8 3v4M16 3v4" stroke={stroke} />
        </>
    ),
    patients: (stroke) => (
        <>
            <Circle cx={9} cy={8} r={3.4} stroke={stroke} />
            <Path d="M3.5 19c.6-3 2.9-4.6 5.5-4.6S13.9 16 14.5 19" stroke={stroke} />
            <Path d="M16 8.2a3 3 0 0 1 0 5.6M18.5 19c-.3-1.8-1-3.1-2-4" stroke={stroke} />
        </>
    ),
    money: (stroke) => (
        <>
            <Rect x={3} y={6} width={18} height={13} rx={3} stroke={stroke} />
            <Path d="M3 11h18" stroke={stroke} />
            <Circle cx={17} cy={15} r={1.3} stroke={stroke} />
        </>
    ),
    // The mockup's own gear, drawn as its two paths: the pinion and the boss.
    settings: (stroke) => (
        <>
            <Path
                d="M19.2 14.4l1.5 1-1.7 3-1.8-.6a6.9 6.9 0 0 1-1.8 1l-.3 1.9h-3.5l-.3-1.9a6.9 6.9 0 0 1-1.8-1l-1.8.6-1.7-3 1.5-1a7 7 0 0 1 0-2l-1.5-1 1.7-3 1.8.6a6.9 6.9 0 0 1 1.8-1l.3-1.9h3.5l.3 1.9c.6.2 1.2.6 1.8 1l1.8-.6 1.7 3-1.5 1a7 7 0 0 1 0 2z"
                stroke={stroke}
            />
            <Circle cx={12} cy={12} r={3} stroke={stroke} />
        </>
    ),
};

export function BottomTabBar({ active, onChange }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'day', label: 'Day' },
        { key: 'patients', label: 'Patients' },
        { key: 'money', label: 'Money' },
        { key: 'settings', label: 'Settings' },
    ];

    return (
        <View style={[styles.bar, { paddingBottom: space[3] + insets.bottom }]} testID="tab-bar">
            {tabs.map((tab) => {
                const selected = tab.key === active;
                const stroke = selected ? color.ink : color.muted;
                return (
                    <Pressable
                        key={tab.key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        accessibilityLabel={tab.label}
                        onPress={() => onChange(tab.key)}
                        style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
                        testID={`tab-${tab.key}`}
                    >
                        <Svg
                            width={22}
                            height={22}
                            viewBox="0 0 24 24"
                            fill="none"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            {ICONS[tab.key](stroke)}
                        </Svg>
                        <Text
                            variant="caption"
                            weight={selected ? 'semibold' : 'medium'}
                            tone={selected ? 'ink' : 'muted'}
                        >
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
        flexDirection: 'row',
        alignItems: 'stretch',
        paddingTop: space[2.5],
        backgroundColor: color.canvas,
        borderTopWidth: border.hair,
        borderTopColor: color.line,
    },
    tab: {
        flex: 1,
        minHeight: size.row,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[1.5],
        paddingVertical: space[1],
        borderRadius: radius.md,
    },
    pressed: { backgroundColor: color.surface2 },
});
