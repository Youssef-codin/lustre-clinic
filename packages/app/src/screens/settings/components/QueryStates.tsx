/**
 * The two states no list in this app is allowed to skip. `ui/` has no
 * skeleton, so this is the cluster-local one — deliberately dumb (grey bars,
 * no shimmer), because a settings list is read a few times a month. The
 * clinic server is a PC over Tailscale that is off during a power cut, so a
 * failed list is a normal state and always offers Retry. `ErrorState`'s
 * message must arrive already localized from `ERROR_CODE`.
 */
import { StyleSheet, View } from 'react-native';
import { Button, Card, CardDivider } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';

export type SkeletonRowsProps = {
    count?: number;
    trailing?: boolean;
};

export function SkeletonRows({ count = 3, trailing = false }: SkeletonRowsProps) {
    return (
        <Card accessibilityLabel="Loading" accessibilityRole="progressbar">
            {Array.from({ length: count }, (_, index) => (
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
    message: string;
    onRetry: () => void;
    retrying?: boolean;
};

export function ErrorState({ message, onRetry, retrying = false }: ErrorStateProps) {
    return (
        <Card variant="dashed" padded style={styles.error}>
            <Text variant="headline">Couldn't load this</Text>
            <Text variant="subhead" tone="muted" style={styles.message}>
                {message}
            </Text>
            <Button
                label="Try again"
                variant="secondary"
                onPress={onRetry}
                loading={retrying}
                style={styles.action}
            />
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
    action: { alignSelf: 'center' },
});
