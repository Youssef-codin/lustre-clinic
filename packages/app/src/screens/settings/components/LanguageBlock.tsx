/**
 * The LANGUAGE block on the settings index: the language's name and a compact
 * EN / ع pill beside it. On the index rather than in a pane so it takes one
 * tap, and drawn whether or not the server answers — the language is this
 * phone's, not the clinic's.
 */
import type { Locale } from '@lustre/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, SectionLabel } from '../../../components/ui';
import { useT } from '../../../i18n';
import { color, radius, space, Text } from '../../../theme';

const LANGUAGES: readonly { value: Locale; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'ar', label: 'ع' },
];

const LANGUAGE_NAME: Record<Locale, string> = { en: 'English', ar: 'العربية' };

export type LanguageBlockProps = {
    locale: Locale;
    onChange: (locale: Locale) => void;
};

export function LanguageBlock({ locale, onChange }: LanguageBlockProps) {
    const t = useT();

    return (
        <View style={styles.section}>
            <SectionLabel inset={false}>LANGUAGE</SectionLabel>

            <Card style={styles.card}>
                <Text variant="body" weight="semibold" style={styles.name}>
                    {LANGUAGE_NAME[locale]}
                </Text>
                <View
                    accessibilityRole="tablist"
                    accessibilityLabel={t('Interface language')}
                    style={styles.track}
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
                                onPress={() => onChange(value)}
                                testID={`settings-language-${value}`}
                                style={[styles.button, selected && styles.buttonOn]}
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
        </View>
    );
}

const styles = StyleSheet.create({
    section: { gap: space[2] },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingStart: space[3.5],
        paddingEnd: space[3],
        paddingVertical: space[3],
    },
    name: { flex: 1, minWidth: 0 },

    /**
     * Two buttons sized to their labels, not `ui/SegmentedControl`: that one is
     * a full-width control — `alignSelf: 'stretch'` over `flex: 1` segments —
     * and inside this row it stretches to the card's height and collapses its
     * labels. This is the mockup's compact pill, which is a different control.
     */
    track: {
        flexDirection: 'row',
        flex: 0,
        padding: space[0.5],
        borderRadius: radius.full,
        backgroundColor: color.surface2,
    },
    button: {
        minHeight: 38,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space[4],
        borderRadius: radius.full,
    },
    buttonOn: { backgroundColor: color.ink },
});
