import { StyleSheet, View } from 'react-native';
import { Button, Card, CardDivider } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';

/**
 * The two states no list in this app is allowed to skip.
 *
 * `ui/` has no skeleton — §7.14 asks for list loading skeletons and none was
 * designed, so this is the cluster-local one (BLOCKED.md). It is deliberately
 * dumb: grey bars at the height of the rows they stand in for, no shimmer. A
 * settings list is read a few times a month and the animation would be the most
 * expensive thing on the screen.
 */

export type SkeletonRowsProps = {
    count?: number;
    /** Rows with a trailing value — a price, a time — draw a second bar. */
    trailing?: boolean;
};

export function SkeletonRows({ count = 3, trailing = false }: SkeletonRowsProps) {
    return (
        <Card accessibilityLabel="Loading" accessibilityRole="progressbar">
            {Array.from({ length: count }, (_, index) => (
                // Static list, so the index is the identity it has.
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no id
                <View key={index}>
                    {index > 0 ? <CardDivider /> : null}
                    <View style={styles.row}>
                        <View style={styles.lines}>
                            <View style={[styles.bar, styles.primary]} />
                            <View style={[styles.bar, styles.secondary]} />
                        </View>
                        {trailing ? <View style={[styles.bar, styles.value]} /> : null}
                    </View>
                </View>
            ))}
        </Card>
    );
}

export type ErrorStateProps = {
    /** Already localized from `ERROR_CODE` — see `errorMessage`. */
    message: string;
    onRetry: () => void;
    retrying?: boolean;
};

/**
 * A list that could not load. The clinic server is a PC over Tailscale that is
 * off during a power cut (§14), so this is a normal state and it always offers
 * the retry rather than telling the user to go back.
 */
export function ErrorState({ message, onRetry, retrying = false }: ErrorStateProps) {
    return (
        <Card variant="dashed" padded style={styles.error}>
            <Text variant="headline">Couldn't load this</Text>
            <Text variant="subhead" tone="muted" style={styles.message}>
                {message}
            </Text>
            <Button label="Try again" variant="secondary" onPress={onRetry} loading={retrying} />
        </Card>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[3],
        paddingHorizontal: space[4],
    },
    lines: { flex: 1, gap: space[1.5] },
    bar: { height: 10, borderRadius: radius.sm, backgroundColor: color.surface2 },
    primary: { width: '52%' },
    secondary: { width: '34%', height: 8 },
    value: { width: 64 },
    error: { alignItems: 'center', gap: space[2] },
    message: { textAlign: 'center' },
});
