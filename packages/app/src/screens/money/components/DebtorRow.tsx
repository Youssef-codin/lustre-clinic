import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Chevron, duration, easing, useReducedMotion } from '../../../components/ui';
import { size, space, Text } from '../../../theme';
import type { PatientBalance } from '../_LocalMoneyApi';
import { MoneyValue } from '../_LocalMoneyValue';
import { outstandingAge } from '../format';

// Inventory §5 `domain/DebtorRow` — name, "Outstanding <age>", the amount, a
// chevron, staggered entry. §7.16 dropped avatars, so there is no initials tile.
//
// The amount is the standing balance for that patient across every visit, as
// `balance.outstanding` derived it (§10). The row does not add anything up.

/** Capped so a long list does not spend two seconds arriving. */
const MAX_STAGGER_STEPS = 8;
const STAGGER_MS = 40;

export type DebtorRowProps = {
    patient: PatientBalance;
    /** Position in the list, for the entry stagger. */
    index: number;
    onPress: () => void;
};

export function DebtorRow({ patient, index, onPress }: DebtorRowProps) {
    const entry = useRef(new Animated.Value(0)).current;
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        const animation = Animated.timing(entry, {
            toValue: 1,
            duration: reducedMotion ? 0 : duration.fadeup,
            delay: reducedMotion ? 0 : Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS,
            easing: easing.standard,
            useNativeDriver: true,
        });

        animation.start();
        return () => animation.stop();
        // Only on mount: re-running on filter would restage the whole list on
        // every keystroke of the search field.
    }, [entry, reducedMotion, index]);

    return (
        <Animated.View
            style={{
                opacity: entry,
                transform: [{ translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}
        >
            <Pressable
                onPress={onPress}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                testID={`money-debtor-${patient.patientId}`}
            >
                <View style={styles.text}>
                    <Text variant="headline" numberOfLines={1}>
                        {patient.name}
                    </Text>
                    <Text variant="subhead" tone="muted">
                        {`Outstanding ${outstandingAge(patient.oldestUnpaidAt)}`}
                    </Text>
                </View>

                <MoneyValue amount={patient.balance} variant="amount" currencyVariant="caption" tone="due" />
                <Chevron />
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
    },
    text: { flex: 1, gap: space[0.5] },
    pressed: { opacity: 0.72 },
});
