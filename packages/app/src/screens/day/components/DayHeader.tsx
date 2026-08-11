/**
 * The header from `day-view-schedule.html`: a branch pill, the wordmark, a
 * date pill. It replaces a centred `Today` between two arrows — the date pill
 * is the only way off today and opens the calendar, carrying the weekday
 * whenever the screen is not on today, so the fact the arrows made obvious is
 * still written down. The branch menu anchors to the pill's start edge via
 * physical left; in RTL the window width less the pill's far edge is the same
 * distance measured the other way. The mark's `letterSpacing` is 0.28em at
 * 15px written out (React Native has no `em`), with half-step padding so the
 * glyphs sit centred.
 */
import { useRef, useState } from 'react';
import { Dimensions, I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { Chevron, DropdownMenu, type MenuAnchor } from '../../../components/ui';
import { border, color, radius, shadow, size, space, Text } from '../../../theme';
import type { Branch } from '../data';
import { formatDate, formatDatePill, relativeDayLabel } from '../time';
import { CalendarIcon, PinIcon } from './icons';

export type DayHeaderProps = {
    dateKey: string;
    branches: readonly Branch[];
    branchId: string | null;
    onPickBranch: (branchId: string) => void;
    onOpenCalendar: () => void;
};

export function DayHeader({ dateKey, branches, branchId, onPickBranch, onOpenCalendar }: DayHeaderProps) {
    const [menu, setMenu] = useState(false);
    const [anchor, setAnchor] = useState<MenuAnchor | undefined>(undefined);
    const pill = useRef<View>(null);

    const branch = branches.find((row) => row.id === branchId) ?? branches[0];
    const switchable = branches.length > 1;

    function openBranches() {
        pill.current?.measureInWindow((x, y, width, height) => {
            const rtl = I18nManager.isRTL;
            setAnchor({
                top: y + height + space[1],
                start: rtl ? Dimensions.get('window').width - (x + width) : x,
            });
            setMenu(true);
        });
    }

    return (
        <View style={styles.header}>
            <View style={styles.row}>
                <View ref={pill} collapsable={false}>
                    <Pressable
                        accessibilityRole={switchable ? 'button' : 'text'}
                        accessibilityLabel={
                            switchable ? `Branch: ${branch?.name ?? 'none'}. Change branch` : branch?.name
                        }
                        disabled={!switchable}
                        onPress={openBranches}
                        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
                    >
                        <PinIcon stroke={color.ink} />
                        <Text variant="callout" weight="semibold" numberOfLines={1} style={styles.branch}>
                            {branch?.name ?? 'Clinic'}
                        </Text>
                        {switchable ? <Chevron direction="down" size={7} /> : null}
                    </Pressable>
                </View>

                <View style={styles.markSlot} pointerEvents="none">
                    <Text variant="body" weight="semibold" style={styles.mark}>
                        MAWID
                    </Text>
                </View>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${relativeDayLabel(dateKey)}, ${formatDate(dateKey)}. Open the calendar`}
                    onPress={onOpenCalendar}
                    style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
                    testID="day-date-pill"
                >
                    <CalendarIcon />
                    <Text variant="footnote" script="mono" weight="medium" tone="ink2">
                        {formatDatePill(dateKey)}
                    </Text>
                    <Chevron direction="down" size={7} />
                </Pressable>
            </View>

            <DropdownMenu
                visible={menu}
                onClose={() => setMenu(false)}
                anchor={anchor}
                accessibilityLabel="Branches"
                options={branches.map((row) => ({ value: row.id, label: row.name }))}
                value={branch?.id ?? ''}
                onChange={onPickBranch}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: size.gutter,
        paddingTop: space[2],
        paddingBottom: space[3],
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1.5],
        paddingVertical: space[1.5],
        paddingHorizontal: space[3],
        minHeight: space[8],
        backgroundColor: color.surface,
        borderRadius: radius.full,
        borderWidth: border.hair,
        borderColor: color.line,
        boxShadow: shadow.pill,
    },
    pressed: { backgroundColor: color.surface2 },
    branch: { maxWidth: 120 },
    markSlot: { position: 'absolute', start: 0, end: 0, alignItems: 'center' },
    mark: { letterSpacing: 4.2, paddingStart: 2.1 },
});
