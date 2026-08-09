import { StyleSheet, View } from 'react-native';
import { color, size, space } from '../../theme';
import { Button } from './Button';

export type ActionBarProps = {
    /** Label changes with state — "Save", "Save 3 changes", "Saved". */
    primaryLabel: string;
    onPrimary: () => void;
    primaryLoading?: boolean;
    primaryDisabled?: boolean;
    /** Destructive primaries exist — the confirm on a deactivate screen. */
    destructive?: boolean;
    /** Present makes it the two-button bar at 1 : 1.6. */
    secondaryLabel?: string;
    onSecondary?: () => void;
    testID?: string;
};

/**
 * The bar pinned to the bottom of an editor. The primary carries the write, so
 * it carries the pending state: the whole point of a fixed action bar is that
 * Save is always under the thumb, which is also what makes it easy to hit twice.
 */
export function ActionBar({
    primaryLabel,
    onPrimary,
    primaryLoading = false,
    primaryDisabled = false,
    destructive = false,
    secondaryLabel,
    onSecondary,
    testID,
}: ActionBarProps) {
    return (
        <View style={styles.bar} testID={testID}>
            {secondaryLabel ? (
                <View style={styles.secondary}>
                    <Button
                        label={secondaryLabel}
                        variant="ghost"
                        onPress={onSecondary}
                        disabled={primaryLoading}
                        block
                    />
                </View>
            ) : null}

            <View style={secondaryLabel ? styles.primary : styles.only}>
                <Button
                    label={primaryLabel}
                    variant={destructive ? 'danger' : 'primary'}
                    onPress={onPrimary}
                    loading={primaryLoading}
                    disabled={primaryDisabled}
                    block
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignSelf: 'stretch',
        gap: space[2],
        paddingHorizontal: size.gutter,
        paddingTop: space[3],
        // Clears the home indicator until a safe-area inset is available.
        paddingBottom: space[6],
        borderTopWidth: 1,
        borderTopColor: color.hair,
        backgroundColor: color.surface,
    },
    secondary: { flex: 1 },
    primary: { flex: 1.6 },
    only: { flex: 1 },
});
