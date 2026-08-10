/**
 * One settings pane: a top bar, a scrolling body, and optionally an action bar
 * under it. Every screen in this cluster is this shape. `Toast` is a child of
 * the pane, never of the list — a toast nested in scrolling content lands
 * wherever that content has scrolled to.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { TopBar } from '../../../components/ui';
import { color, size, space } from '../../../theme';

export type PaneProps = {
    title: string;
    subtitle?: string;
    onBack: () => void;
    trailing?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    overlay?: ReactNode;
    testID?: string;
};
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
    pane: { flex: 1, backgroundColor: color.canvas },
    scroll: { flex: 1 },
    content: { padding: size.gutter, gap: space[4], paddingBottom: space[12] },
});
