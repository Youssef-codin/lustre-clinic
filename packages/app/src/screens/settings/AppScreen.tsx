/**
 * Settings → App: the two things that are about this phone rather than about
 * the clinic — what language it draws in, and which way it is reaching the
 * server.
 *
 * There is no server picker, and that is the design's point, not an omission:
 * the clinic has one server, and the app decides for itself whether to take the
 * LAN address or the tailnet one (`api/connection.ts` probes LAN first). So the
 * card reports the route and offers a re-probe — the one useful action when the
 * phone has stayed on the wrong answer after walking out of the clinic.
 */
import type { Locale } from '@lustre/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Dot, SectionLabel } from '../../components/ui';
import { color, radius, space, Text } from '../../theme';
import { ReprobeIcon } from './components/icons';
import { Pane } from './components/Pane';
import { useConnectionView } from './data/connection';

const LANGUAGES: readonly { value: Locale; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'ar', label: 'ع' },
];

const LANGUAGE_NAME: Record<Locale, string> = { en: 'English', ar: 'العربية' };

export type AppScreenProps = {
    locale: Locale;
    onChangeLocale: (locale: Locale) => void;
    onBack: () => void;
};

export function AppScreen({ locale, onChangeLocale, onBack }: AppScreenProps) {
    const connection = useConnectionView();

    return (
        <Pane title="App" onBack={onBack} testID="settings-app">
            <View style={styles.section}>
                <SectionLabel inset={false}>LANGUAGE</SectionLabel>

                <Card style={styles.languageCard}>
                    <Text variant="body" weight="semibold" style={styles.languageName}>
                        {LANGUAGE_NAME[locale]}
                    </Text>
                    <View
                        accessibilityRole="tablist"
                        accessibilityLabel="Interface language"
                        style={styles.langTrack}
                        testID="settings-language"
                    >
                        {LANGUAGES.map(({ value, label }) => {
                            const selected = value === locale;
                            return (
                                <Pressable
                                    key={value}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected }}
                                    accessibilityLabel={LANGUAGE_NAME[value]}
                                    onPress={() => onChangeLocale(value)}
                                    testID={`settings-language-${value}`}
                                    style={[styles.langButton, selected && styles.langButtonOn]}
                                >
                                    <Text
                                        variant="subhead"
                                        weight="semibold"
                                        tone={selected ? 'inverse' : 'ink2'}
                                    >
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </Card>

                <Text variant="footnote" tone="muted" style={styles.hint}>
                    Changes the interface everywhere, including printed receipts. Patient messages use the
                    patient's own language.
                </Text>
            </View>

            <View style={styles.section}>
                <SectionLabel inset={false}>SERVER CONNECTION</SectionLabel>

                <Card padded style={styles.serverCard}>
                    <View style={styles.serverHead}>
                        <Dot tone={connection.tone} size={8} pulse={connection.pulse} />
                        <Text variant="body" weight="semibold" style={styles.serverName}>
                            {connection.serverName}
                        </Text>
                        <Text variant="footnote" weight="semibold" tone={statusTone(connection.kind)}>
                            {connection.label}
                        </Text>
                    </View>

                    <Text variant="subhead" weight="medium" tone="muted" script="mono">
                        {connection.serverAddress}
                    </Text>

                    <View style={styles.probe}>
                        <Text variant="footnote" tone="muted" script="mono" style={styles.stamp}>
                            {connection.stamp ?? 'Not checked yet'}
                        </Text>
                        <Button
                            label={connection.probing ? 'Probing…' : 'Re-probe'}
                            variant="secondary"
                            size="md"
                            onPress={connection.reprobe}
                            loading={connection.probing}
                            icon={<ReprobeIcon size={14} stroke={color.ink} width={2.2} />}
                            testID="settings-app-reprobe"
                        />
                    </View>
                </Card>

                <Text variant="footnote" tone="muted" style={styles.hint}>
                    Lustre prefers the clinic server when you are on its wifi and falls back to the tailnet
                    elsewhere. Re-probe if the app is stuck on the wrong one.
                </Text>
            </View>
        </Pane>
    );
}

function statusTone(kind: ReturnType<typeof useConnectionView>['kind']) {
    if (kind === 'wifi') return 'wa' as const;
    if (kind === 'offline') return 'due' as const;
    return 'muted' as const;
}

const styles = StyleSheet.create({
    section: { gap: space[2] },
    languageCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingStart: space[3.5],
        paddingEnd: space[3],
        paddingVertical: space[3],
    },
    languageName: { flex: 1, minWidth: 0 },

    /**
     * Two buttons sized to their labels, not `ui/SegmentedControl`: that one is
     * a full-width control — `alignSelf: 'stretch'` over `flex: 1` segments —
     * and inside this row it stretches to the card's height and collapses its
     * labels. This is the mockup's compact pill, which is a different control.
     */
    langTrack: {
        flexDirection: 'row',
        flex: 0,
        padding: space[0.5],
        borderRadius: radius.full,
        backgroundColor: color.surface2,
    },
    langButton: {
        minHeight: 38,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space[4],
        borderRadius: radius.full,
    },
    langButtonOn: { backgroundColor: color.ink },

    serverCard: { gap: space[1.5] },
    serverHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    serverName: { flex: 1, minWidth: 0 },

    probe: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        marginTop: space[1.5],
        paddingTop: space[3],
        borderTopWidth: 1,
        borderTopColor: color.hair,
    },
    stamp: { flex: 1 },

    hint: { paddingHorizontal: space[0.5] },
});
