/**
 * The bar pinned to the bottom of an editor. The primary carries the write, so
 * it carries the pending state — Save under the thumb is also what makes it easy
 * to hit twice. `paddingBottom: space[6]` clears the home indicator until a
 * safe-area inset is available.
 *
 * **The keyboard is in that padding for the same reason it is in `ui/Sheet`.**
 * `edgeToEdgeEnabled` is on in `android/gradle.properties` — the Expo SDK 54+
 * default — so the app is laid out behind the IME and `adjustResize` resizes
 * nothing. The bar is the last child of a column whose bottom is the bottom of
 * a window that never got shorter, so with the keyboard up it stayed exactly
 * where it was and the keys were drawn over it, along with whatever field sits
 * just above it. Growing the floor is what lifts it: the bar's content is above
 * its own bottom padding, so padding by the keyboard moves the buttons — and
 * the scroll's remaining height — clear of the keys.
 *
 * The keyboard height already includes the navigation bar it is drawn over (see
 * `useKeyboardHeight`), and the tab bar under a pane leaves the layout while it
 * is up, so the bar's bottom edge is the window's. `space[3]` on top keeps the
 * primary off the keys. With the keyboard down this is still `space[6]`.
 */
import { StyleSheet, View } from 'react-native';
import { color, size, space } from '../../theme';
import { Button } from './Button';
import { useKeyboardHeight } from './useKeyboardHeight';

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
    const keyboard = useKeyboardHeight();

    return (
        <View
            style={[styles.bar, { paddingBottom: keyboard > 0 ? keyboard + space[3] : space[6] }]}
            testID={testID}
        >
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
        // `paddingBottom` is supplied inline — it carries the keyboard. Setting
        // it here too would be a second source of truth that the inline one
        // silently wins over.
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
