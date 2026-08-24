/**
 * The app's global navigation: four items, 22px stroked icons over an 11px
 * label, the active tab in `ink` and the rest in `muted`. The bar sits in flow
 * at the bottom of the shell rather than absolutely positioned, and carries the
 * bottom safe-area inset itself — an absolute position would put the labels
 * under Android's own gesture bar.
 *
 * The fourth tab says the role — "Doctor" or "Secretary", over a stethoscope or
 * a headset — because the device is the account and that is the one thing about
 * the app worth knowing before you tap anything. What changed is where it goes:
 * it used to flip the role in place, which meant a mis-tap silently changed what
 * the app could do and left Settings with no way in at all. Now it opens
 * Settings, and the role is the card at the top of that screen with a sheet that
 * says what switching changes before it changes anything.
 *
 * `settings.html` labels this tab "Settings" over a gear. Naming the role is a
 * deliberate departure: the gear is the same on both phones, and which phone
 * this is answers more questions than what the screen contains.
 */
import type { ClientRole } from '@lustre/shared';
import { Calendar, CreditCard, Headset, Stethoscope, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { border, color, radius, size, space, Text } from '../../theme';

export type TabKey = 'day' | 'patients' | 'money' | 'settings';

export type BottomTabBarProps = {
    active: TabKey;
    /** The fourth tab's glyph and its label both come from this. */
    role: ClientRole;
    onChange: (tab: TabKey) => void;
};

const SIZE = 22;
const STROKE = 2;

/**
 * The fourth tab opens Settings, but its glyph is the role this device is on —
 * a stethoscope for the doctor, a headset for the desk. It is the one thing
 * about the app that is true before you tap anything, and the tab is where it
 * belongs now that the role is no longer a tab of its own.
 */
const ROLE_ICON: Record<ClientRole, typeof Calendar> = {
    doctor: Stethoscope,
    secretary: Headset,
};

const ROLE_LABEL: Record<ClientRole, string> = {
    doctor: 'Doctor',
    secretary: 'Secretary',
};

const TAB_ICON: Record<Exclude<TabKey, 'settings'>, typeof Calendar> = {
    day: Calendar,
    patients: Users,
    money: CreditCard,
};

export function BottomTabBar({ active, role, onChange }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const RoleGlyph = ROLE_ICON[role];

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'day', label: 'Day' },
        { key: 'patients', label: 'Patients' },
        { key: 'money', label: 'Money' },
        { key: 'settings', label: ROLE_LABEL[role] },
    ];

    return (
        <View style={[styles.bar, { paddingBottom: space[3] + insets.bottom }]} testID="tab-bar">
            {tabs.map((tab) => {
                const selected = tab.key === active;
                const stroke = selected ? color.ink : color.muted;
                const Glyph = tab.key === 'settings' ? RoleGlyph : TAB_ICON[tab.key];
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
                        <Glyph size={SIZE} color={stroke} strokeWidth={STROKE} />
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
