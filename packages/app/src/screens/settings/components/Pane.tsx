/**
 * One settings pane: a header, a scrolling body, and optionally an action bar
 * under it. Every screen in this cluster is this shape. `Toast` is a child of
 * the pane, never of the list — a toast nested in scrolling content lands
 * wherever that content has scrolled to.
 *
 * The header is the cluster's own rather than `ui/TopBar`. Every pane in
 * `settings.html` draws the same one: a round white back button and the title
 * beside it, left-aligned, sitting on the canvas with no bar behind it and no
 * rule under it. `TopBar` centres its title on a white ground with a divider,
 * which is right for the money cluster's screens and is why this is not a
 * change to the shared component. The trailing slot is pushed to the end
 * instead of balancing the back button, because nothing here needs centring.
 */
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { RefreshControlElement } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import { BackIcon } from './icons';

export type PaneProps = {
    title: string;
    subtitle?: string;
    onBack: () => void;
    trailing?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    overlay?: ReactNode;
    /** `usePullToRefresh` from the pane's own screen — settings are read once
     * on open, so this is the only way to see what the other phone changed. */
    refreshControl?: RefreshControlElement;
    testID?: string;
};
export function Pane({
    title,
    subtitle,
    onBack,
    trailing,
    children,
    footer,
    overlay,
    refreshControl,
    testID,
}: PaneProps) {
    return (
        <View style={styles.pane} testID={testID}>
            <View style={styles.header}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    onPress={onBack}
                    hitSlop={12}
                    style={({ pressed }) => [styles.back, pressed && styles.pressed]}
                >
                    <BackIcon size={15} />
                </Pressable>

                <View style={styles.titles}>
                    <Text variant="title3" numberOfLines={1} accessibilityRole="header">
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>

                {trailing}
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                refreshControl={refreshControl}
            >
                {children}
            </ScrollView>

            {footer}
            {overlay}
        </View>
    );
}

const styles = StyleSheet.create({
    pane: { flex: 1, backgroundColor: color.canvas },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingStart: space[4.5],
        paddingEnd: size.bleed,
        paddingTop: space[2],
        paddingBottom: space[3.5],
    },
    back: {
        width: 34,
        height: 34,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        borderWidth: border.hair,
        borderColor: color.outline,
        backgroundColor: color.surface,
    },
    pressed: { opacity: 0.6 },
    // Takes the slack so a trailing action is pushed to the end.
    titles: { flex: 1, minWidth: 0 },

    scroll: { flex: 1 },
    content: { padding: size.gutter, gap: space[4], paddingBottom: space[12] },
});
