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

                {/* On the meta line, not above the name. Above it the badge
                    pushed the name down while the call buttons stayed put, and
                    the header's whole shape is the name and the two ways to
                    reach them on one line. Here it leads the line it belongs
                    to — the row of small facts about who this is. */}
                <View style={styles.meta}>
                    {patient.legacyRef !== null ? <LegacyBadge /> : null}

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

    // The old system's number is stored but not drawn here. It is a figure that
    // answers nothing anyone asks out loud, and a second number beside the
    // phone in a line of mono digits reads as a second phone number. Where the
    // refs belong on a record is its own question — see the Notion task.
    return [who, patient.phone].filter((part): part is string => Boolean(part));
}

/**
 * This record came across from the old system rather than being registered
 * here. It has to be unmissable: a migrated record has almost no history behind
 * it, and without the badge that reads as a patient who has never been in —
 * which is the wrong thing to tell someone standing at the desk.
 *
 * Local rather than `ui/Tag`, which is frozen (§10) and cannot go this loud:
 * its strongest fill is `surface2`, four values off `canvas`, and its `ink`
 * tone puts dark type on that — a chip that disappears into the page. This is
 * the inversion `Tag` has no variant for, drawn the way every other emphatic
 * chip in the app is: solid `ink`, `inverse` type. See BLOCKED.md.
 */
function LegacyBadge() {
    return (
        <View style={styles.legacy}>
            <Text variant="tag" weight="bold" tone="inverse">
                LEGACY
            </Text>
        </View>
    );
}

/** `wa.me` wants the number without a `+` or separators. */
function whatsAppUrl(phone: string): string {
    return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
    identity: { flex: 1, gap: space[1.5] },
    name: { flexShrink: 1 },
    // Solid ink, so it reads before the name does. Slightly more padding than
    // `ui/Tag` gives its chips: this one is a label on the record and not a
    // status on a row, and at `tag` size it needs the room to carry.
    legacy: {
        paddingHorizontal: space[2],
        paddingVertical: space[1],
        borderRadius: radius.sm,
        backgroundColor: color.ink,
    },
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
