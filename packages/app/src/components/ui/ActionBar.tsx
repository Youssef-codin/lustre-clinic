/**
 * The bar pinned to the bottom of an editor. The primary carries the write, so
 * it carries the pending state — Save under the thumb is also what makes it easy
 * to hit twice. `paddingBottom: space[6]` clears the home indicator until a
 * safe-area inset is available.
 */
import { StyleSheet, View } from 'react-native';
import { color, size, space } from '../../theme';
import { Button } from './Button';

export type ActionBarProps = {
    primaryLabel: string;
    onPrimary: () => void;
    primaryLoading?: boolean;
    primaryDisabled?: boolean;
    destructive?: boolean;
    secondaryLabel?: string;
    onSecondary?: () => void;
    testID?: string;
};

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
        paddingBottom: space[6],
        borderTopWidth: 1,
        borderTopColor: color.hair,
        backgroundColor: color.surface,
    },
    secondary: { flex: 1 },
    primary: { flex: 1.6 },
    only: { flex: 1 },
});
