/**
 * Who this is, and the two ways to reach them — `patient-view.html`. The name
 * gets the title size and wraps rather than truncating: an Egyptian record holds
 * four-part names in two scripts, and a clipped name is the wrong patient.
 *
 * The meta line is mono because every part of it is a figure read aloud or typed
 * into a keypad. Sex and age come off the record; either can be missing, and the
 * separators collapse rather than leaving a stranded interpunct.
 *
 * WhatsApp is filled green and Call is outlined because the clinic messages far
 * more than it rings — and per PRODUCT.md the app never sends: `wa.me` opens the
 * chat with the user's own WhatsApp, and they type. Both are `Linking`, so both
 * are a round trip out of the app and back.
 */
import { Fragment } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { border, color, radius, space, Text } from '../../../theme';
import type { Patient } from '../data/types';
import { sentenceCase } from './format';
import { CallIcon, WhatsAppIcon } from './icons';

export type PatientHeaderProps = {
    patient: Patient;
    onFailed: (message: string) => void;
};

export function PatientHeader({ patient, onFailed }: PatientHeaderProps) {
    const open = (url: string, failure: string) => {
        void Linking.openURL(url).catch(() => onFailed(failure));
    };

    return (
        <View style={styles.header}>
            <View style={styles.identity}>
                <Text variant="title" weight="semibold" style={styles.name}>
                    {patient.name}
                </Text>
                <View style={styles.meta}>
                    {metaParts(patient).map((part, index) => (
                        <Fragment key={part}>
                            {/* A rule, not an interpunct: the design separates two
                                figures with a hairline bar so neither reads as
                                punctuation inside the number. */}
                            {index > 0 ? <View style={styles.divider} /> : null}
                            <Text variant="subhead" script="mono" tone="muted">
                                {part}
                            </Text>
                        </Fragment>
                    ))}
                </View>
            </View>

            <View style={styles.actions}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`WhatsApp ${patient.name}`}
                    onPress={() => open(whatsAppUrl(patient.phone), 'WhatsApp could not be opened.')}
                    style={({ pressed }) => [styles.action, styles.whatsApp, pressed && styles.pressed]}
                >
                    <WhatsAppIcon size={18} stroke={color.inverse} />
                </Pressable>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${patient.name}`}
                    onPress={() => open(`tel:${patient.phone}`, 'The dialler could not be opened.')}
                    style={({ pressed }) => [styles.action, styles.call, pressed && styles.pressed]}
                >
                    <CallIcon size={17} stroke={color.ink} />
                </Pressable>
            </View>
        </View>
    );
}

/** `Female, 34` and `+201004001008` — with whatever of it the record actually holds. */
function metaParts(patient: Patient): string[] {
    const who = [sentenceCase(patient.gender), patient.age === null ? null : String(patient.age)]
        .filter(Boolean)
        .join(', ');

    return [who, patient.phone].filter((part): part is string => Boolean(part));
}

/** `wa.me` wants the number without a `+` or separators. */
function whatsAppUrl(phone: string): string {
    return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
    identity: { flex: 1, gap: space[1.5] },
    name: { flexShrink: 1 },
    meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2.5] },
    divider: { width: 1, height: 11, backgroundColor: color.outline },
    actions: { flexDirection: 'row', gap: space[2], paddingTop: space[0.5] },
    action: {
        width: 40,
        height: 40,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    whatsApp: { backgroundColor: color.wa },
    call: { borderWidth: border.thick, borderColor: color.outline },
    pressed: { opacity: 0.6 },
});
