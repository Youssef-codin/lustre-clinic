import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { color, size, space, Text } from '../../theme';
import { Chevron } from './Chevron';

export type TopBarProps = {
    title?: string;
    subtitle?: string;
    onBack?: () => void;
    backLabel?: string;
    /** An IconButton, or a text Button for Reorder / Done. */
    trailing?: ReactNode;
    /** Hairline under the bar. Off when the screen's own content draws one. */
    divider?: boolean;
};

/** Back, title, one trailing action. Every sub-screen has one. */
export function TopBar({
    title,
    subtitle,
    onBack,
    backLabel = 'Back',
    trailing,
    divider = true,
}: TopBarProps) {
    return (
        <View style={[styles.bar, divider && styles.divider]}>
            <View style={styles.side}>
                {onBack ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={backLabel}
                        onPress={onBack}
                        hitSlop={12}
                        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
                    >
                        <Chevron direction="back" size={9} tone="ink" />
                    </Pressable>
                ) : null}
            </View>

            <View style={styles.titles}>
                {title ? (
                    <Text variant="headline" numberOfLines={1}>
                        {title}
                    </Text>
                ) : null}
                {subtitle ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                        {subtitle}
                    </Text>
                ) : null}
            </View>

            {/* Same width as the back slot so the title stays optically centred
                whether or not there is a trailing action. */}
            <View style={styles.side}>{trailing}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        minHeight: size.button,
        paddingHorizontal: space[3],
        backgroundColor: color.surface,
    },
    divider: { borderBottomWidth: 1, borderBottomColor: color.hair },
    side: { minWidth: 44, alignItems: 'center', justifyContent: 'center' },
    back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    titles: { flex: 1, alignItems: 'center' },
    pressed: { opacity: 0.6 },
});
