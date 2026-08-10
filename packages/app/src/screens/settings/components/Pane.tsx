import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { TopBar } from '../../../components/ui';
import { color, size, space } from '../../../theme';

export type PaneProps = {
    title: string;
    subtitle?: string;
    onBack: () => void;
    /** A text Button for Reorder / Done, or an IconButton. */
    trailing?: ReactNode;
    children: ReactNode;
    /** An `ActionBar`, pinned below the scroll area. */
    footer?: ReactNode;
    /** A `Toast`, positioned against this pane rather than against a list. */
    overlay?: ReactNode;
    testID?: string;
};

/**
 * One settings pane: a top bar, a scrolling body, and optionally an action bar
 * under it. Every screen in this cluster is this shape, and the shape is the
 * reason `Toast` is a child of the pane and not of the list — a toast nested in
 * scrolling content lands wherever that content happens to have scrolled to.
 */
export function Pane({ title, subtitle, onBack, trailing, children, footer, overlay, testID }: PaneProps) {
    return (
        <View style={styles.pane} testID={testID}>
            <TopBar title={title} subtitle={subtitle} onBack={onBack} trailing={trailing} />

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
            >
                {children}
            </ScrollView>

            {footer}
            {overlay}
        </View>
    );
}

const styles = StyleSheet.create({
    // Reserves the shell's tab bar, which is drawn over every cluster.
    pane: { flex: 1, backgroundColor: color.canvas, paddingBottom: size.nav },
    scroll: { flex: 1 },
    content: { padding: size.gutter, gap: space[4], paddingBottom: space[6] },
});
