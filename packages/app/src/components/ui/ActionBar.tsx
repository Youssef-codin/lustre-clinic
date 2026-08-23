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
                    {/* Outlined, not `ghost`: the bar is already `color.surface`,
                        so a ghost button's white fill and pill shadow put white
                        on white and read as a stray shape rather than the
                        quieter half of a pair. */}
                    <Button
                        label={secondaryLabel}
                        variant="secondary"
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
        // Canvas, not surface. The pane above and the tab bar below are both
        // canvas, so a white bar between them was the one strip in a different
        // colour — read as a seam rather than as a footer. The hair rule is what
        // separates it; the fill has no work to do.
        backgroundColor: color.canvas,
    },
    secondary: { flex: 1 },
    primary: { flex: 1.6 },
    only: { flex: 1 },
});
