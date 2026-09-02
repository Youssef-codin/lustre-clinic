/**
 * The three things a day can be other than a schedule — still loading, failed,
 * or genuinely empty — so a screen that shows nothing while it loads looks
 * nothing like a quiet Tuesday. The retry button carries no `loading`: the
 * whole panel is replaced by the skeleton the moment the query goes back to
 * loading, so a spinner here would never be seen. What each empty day says and
 * offers is `empty.ts`; the only thing decided here is how it is drawn.
 *
 * Nothing in the empty state is a `+`. The day view carries the `BookFab`, and
 * a second 52px circle around a second `+` is the FAB drawn twice with one of
 * them wired up. Booking is offered by the FAB and by the labelled CTA; the
 * ring illustrates and nothing more, so a past day — which offers nothing —
 * has no ring at all.
 *
 * `elsewhere` is the branch working a day this one is not. The day is fetched
 * for the whole clinic, so the count is already to hand, and an empty branch
 * that says nothing about it is how "Nothing booked" gets read as a broken
 * fetch rather than a quiet Maadi.
 */
import { StyleSheet, View } from 'react-native';
import { Button, EmptyState } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';
import type { RequestError } from '../data';
import { emptyDay } from '../empty';
import { describeError } from '../errors';
import { CalendarIcon } from './icons';

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
                <Button label="Try again" variant="secondary" onPress={onRetry} style={styles.action} />
            </View>
        </View>
    );
}

export type DayEmptyProps = {
    past: boolean;
    onBook?: () => void;
    elsewhere?: { name: string; count: number; onGo: () => void };
};

export function DayEmpty({ past, onBook, elsewhere }: DayEmptyProps) {
    const state = emptyDay(past, onBook !== undefined);

    return (
        <View style={styles.centred}>
            <EmptyState
                weight="ring"
                icon={state.glyph === 'calendar' ? <CalendarIcon size={22} /> : null}
                title={state.title}
                body={state.body}
                actionLabel={state.actionLabel}
                onAction={state.actionLabel ? onBook : undefined}
            />

            {elsewhere ? (
                <View style={styles.elsewhere}>
                    <Text variant="footnote" tone="muted" style={styles.centredText}>
                        {elsewhere.count} {elsewhere.count === 1 ? 'appointment' : 'appointments'} that day,
                        in {elsewhere.name}.
                    </Text>
                    <Button
                        label={`Open ${elsewhere.name}`}
                        variant="text"
                        size="md"
                        onPress={elsewhere.onGo}
                        style={styles.action}
                    />
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    skeleton: { padding: size.gutter, gap: space[3] },
    bar: { backgroundColor: color.surface2, borderRadius: radius.md },
    centred: { flex: 1, justifyContent: 'center', padding: size.gutter },
    panel: { alignItems: 'center', gap: space[3] },
    centredText: { textAlign: 'center' },
    elsewhere: { marginTop: space[5], alignItems: 'center', gap: space[1] },
    action: { alignSelf: 'center' },
});
