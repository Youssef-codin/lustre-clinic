import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { size, space, Text } from '../../theme';

export type ScreenHeaderProps = {
    title: string;
    /** Eyebrow above the title — the period, the date, the branch. */
    eyebrow?: string;
    subtitle?: string;
    /** Overflow IconButton, usually. */
    trailing?: ReactNode;
};

/** The large `h1` on a root screen. Sub-screens get a TopBar instead. */
export function ScreenHeader({ title, eyebrow, subtitle, trailing }: ScreenHeaderProps) {
    return (
        <View style={styles.header}>
            <View style={styles.titles}>
                {eyebrow ? (
                    <Text variant="eyebrow" tone="muted">
                        {eyebrow}
                    </Text>
                ) : null}
                <Text variant="title" accessibilityRole="header">
                    {title}
                </Text>
                {subtitle ? (
                    <Text variant="subhead" tone="muted">
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {trailing}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        alignSelf: 'stretch',
        gap: space[3],
        paddingHorizontal: size.gutter,
        paddingTop: space[4],
        paddingBottom: space[3],
    },
    titles: { flex: 1, gap: space[1] },
});
