/**
 * Which tooth — the chart, not a dropdown. Four quadrants laid out the way a
 * dentist reads them (upper right runs towards the midline), searchable because
 * "UL6" is faster to type than to find, and with an explicit way out: plenty of
 * work belongs to the mouth rather than to a number, and a picker that insists
 * on a tooth gets a wrong one.
 */

import type { Tooth } from '@mawid/shared';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SearchField, Sheet } from '../../../components/ui';
import { border, color, radius, space, Text } from '../../../theme';
import { QUADRANTS } from '../procedures';

export type ToothSheetProps = {
    visible: boolean;
    onClose: () => void;
    onPick: (tooth: Tooth | null) => void;
};

export function ToothSheet({ visible, onClose, onPick }: ToothSheetProps) {
    const [term, setTerm] = useState('');
    const query = term.trim().toUpperCase();

    const quadrants = QUADRANTS.map((quadrant) => ({
        ...quadrant,
        codes: query ? quadrant.codes.filter((code) => code.includes(query)) : quadrant.codes,
    })).filter((quadrant) => quadrant.codes.length > 0);

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            title="Which tooth?"
            subtitle="Pick the tooth first, or skip if it does not apply."
            testID="tooth-sheet"
            footer={
                <Pressable
                    accessibilityRole="button"
                    onPress={() => onPick(null)}
                    style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
                >
                    <Text variant="subhead" weight="medium" tone="muted">
                        No tooth assigned
                    </Text>
                </Pressable>
            }
        >
            <SearchField
                value={term}
                onChangeText={setTerm}
                onClear={() => setTerm('')}
                variant="sheet"
                placeholder="Search, e.g. UL6"
                autoCapitalize="characters"
                autoCorrect={false}
            />

            {quadrants.length === 0 ? (
                <Text variant="subhead" tone="muted">
                    No matching teeth.
                </Text>
            ) : (
                <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
                    {quadrants.map((quadrant) => (
                        <View key={quadrant.key} style={styles.quadrant}>
                            <Text variant="eyebrow" tone="muted">
                                {quadrant.name.toUpperCase()}
                            </Text>
                            <View style={styles.teeth}>
                                {quadrant.codes.map((code) => (
                                    <Pressable
                                        key={code}
                                        accessibilityRole="button"
                                        accessibilityLabel={code}
                                        onPress={() => onPick(code)}
                                        style={({ pressed }) => [styles.tooth, pressed && styles.pressed]}
                                    >
                                        <Text variant="caption" script="sans" weight="bold">
                                            {code}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    ))}
                </ScrollView>
            )}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    scroll: { maxHeight: 360 },
    quadrant: { gap: space[2], marginBottom: space[4] },
    teeth: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1.5] },
    tooth: {
        width: '11.6%',
        minHeight: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    skip: {
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        borderWidth: border.hair,
        borderStyle: 'dashed',
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    pressed: { backgroundColor: color.surface2 },
});
