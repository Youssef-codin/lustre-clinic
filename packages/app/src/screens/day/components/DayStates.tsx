import { StyleSheet, View } from 'react-native';
import { Button, EmptyState } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';
import type { RequestError } from '../data';
import { describeError } from '../errors';

/**
 * The three things a day can be other than a schedule: still loading, failed,
 * or genuinely empty. Every list needs all three — a screen that shows nothing
 * while it loads and nothing when it fails looks identical to a quiet Tuesday.
 */

/** Bars roughly where the blocks will be, so the layout does not jump. */
export function DaySkeleton() {
    return (
        <View style={styles.skeleton} accessibilityLabel="Loading the day" accessible>
            {[64, 96, 48, 72, 56].map((height, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative list
                <View key={index} style={[styles.bar, { height }]} />
            ))}
        </View>
    );
}

export type DayErrorProps = {
    error: RequestError;
    onRetry: () => void;
};

// No `loading` on the retry: this whole panel is replaced by the skeleton the
// moment the query goes back to loading, so a spinner here would never be seen.
export function DayError({ error, onRetry }: DayErrorProps) {
    const { title, body } = describeError(error, 'day');

    return (
        <View style={styles.centred}>
            <View style={styles.panel}>
                <Text variant="headline" weight="semibold" style={styles.centredText}>
                    {title}
                </Text>
                {body ? (
                    <Text variant="body" tone="muted" style={styles.centredText}>
                        {body}
                    </Text>
                ) : null}
                <Button label="Try again" variant="secondary" onPress={onRetry} />
            </View>
        </View>
    );
}

export type DayEmptyProps = {
    /** Past days cannot be filled, so they get a statement rather than an offer. */
    past: boolean;
    onWalkIn: () => void;
};

export function DayEmpty({ past, onWalkIn }: DayEmptyProps) {
    return (
        <View style={styles.centred}>
            <EmptyState
                weight="ring"
                icon={<Text variant="title3">+</Text>}
                title={past ? 'Nothing happened this day' : 'Nothing booked'}
                body={
                    past
                        ? 'No appointments were booked, and nobody walked in.'
                        : 'The day is clear. A patient who turns up without an appointment goes in as a walk-in.'
                }
                actionLabel={past ? undefined : 'Add a walk-in'}
                onAction={past ? undefined : onWalkIn}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    skeleton: { padding: size.gutter, gap: space[3] },
    bar: { backgroundColor: color.surface2, borderRadius: radius.md },
    centred: { flex: 1, justifyContent: 'center', padding: size.gutter },
    panel: { alignItems: 'center', gap: space[3] },
    centredText: { textAlign: 'center' },
});
