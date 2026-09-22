import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n';
import { size, space, Text } from '../../theme';

export type ScreenHeaderProps = {
    title: string;
    eyebrow?: string;
    subtitle?: string;
    trailing?: ReactNode;
};

export function ScreenHeader({ title, eyebrow, subtitle, trailing }: ScreenHeaderProps) {
    const t = useT();

    return (
        <View style={styles.header}>
            <View style={styles.titles}>
                {eyebrow ? (
                    <Text variant="eyebrow" tone="muted">
                        {t(eyebrow)}
                    </Text>
                ) : null}
                <Text variant="title" accessibilityRole="header">
                    {t(title)}
                </Text>
                {subtitle ? (
                    <Text variant="subhead" tone="muted">
                        {t(subtitle)}
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
