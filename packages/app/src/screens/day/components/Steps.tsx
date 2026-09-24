/**
 * The parts of a stepped page that are not its questions: the numbered bar
 * across the top that says which one this is, and the rows of the read-back on
 * the last step. `BookingScreen` drew them first; the record's Old visit asks
 * its own three questions the same way, and the two must not look like two
 * different apps.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../../i18n';
import { border, color, radius, size, space, Text } from '../../../theme';
import { CheckIcon } from './icons';

export type StepItem = { key: string; label: string };

/** Which of the page's questions this is — the page's own progress. */
export function Steps({
    index,
    steps,
    testID,
}: {
    index: number;
    steps: readonly StepItem[];
    testID?: string;
}) {
    const t = useT();
    return (
        <View
            accessibilityLabel={t('Step {step} of {steps}', { step: index + 1, steps: steps.length })}
            style={styles.steps}
            testID={testID}
        >
            {steps.map((step, at) => {
                const done = at < index;
                const here = at === index;

                return (
                    <View key={step.key} style={styles.step}>
                        <View style={styles.stepRow}>
                            <View
                                style={[
                                    styles.stepDot,
                                    done && styles.stepDotDone,
                                    here && styles.stepDotHere,
                                ]}
                            >
                                {done ? (
                                    <CheckIcon size={11} stroke={color.inverse} />
                                ) : (
                                    <Text
                                        variant="caption"
                                        script="sans"
                                        weight="bold"
                                        tone={here ? 'inverse' : 'muted'}
                                    >
                                        {at + 1}
                                    </Text>
                                )}
                            </View>
                            <Text
                                variant="footnote"
                                weight={here ? 'bold' : 'medium'}
                                tone={here ? 'ink' : 'muted'}
                                numberOfLines={1}
                                style={styles.grow}
                            >
                                {t(step.label)}
                            </Text>
                        </View>
                        <View style={[styles.stepBar, at <= index && styles.stepBarDone]} />
                    </View>
                );
            })}
        </View>
    );
}

/**
 * `lead` is the one row the eye should land on first — the day it is for.
 * `icon` is a slot rather than an icon name so the caller sizes the glyph to
 * its own row; the lead row's text is larger and the icon goes with it.
 * Centred rather than baseline-aligned: a glyph has no baseline to share.
 */
export function SummaryRow({
    label,
    value,
    icon,
    lead = false,
}: {
    label: string;
    value: string;
    icon?: ReactNode;
    lead?: boolean;
}) {
    const t = useT();
    return (
        <View style={styles.summaryLine}>
            <View style={[styles.summaryLabel, styles.grow]}>
                {icon}
                <Text variant="subhead" tone="muted" numberOfLines={1}>
                    {t(label)}
                </Text>
            </View>
            <Text
                variant={lead ? 'headline' : 'callout'}
                weight={lead ? 'bold' : 'semibold'}
                numberOfLines={1}
            >
                {value}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    grow: { flex: 1, minWidth: 0 },

    steps: {
        flexDirection: 'row',
        gap: space[2],
        paddingHorizontal: size.gutter,
        paddingBottom: space[3.5],
    },
    step: { flex: 1, gap: space[2] },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    stepDot: {
        width: 22,
        height: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    stepDotHere: { backgroundColor: color.ink, borderColor: color.ink },
    stepDotDone: { backgroundColor: color.ink2, borderColor: color.ink2 },
    stepBar: { height: 4, borderRadius: radius.full, backgroundColor: color.line },
    stepBarDone: { backgroundColor: color.ink },

    summaryLine: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    summaryLabel: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
