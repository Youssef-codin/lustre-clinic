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
                    <RefChip value={patient.ref} />

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

/**
 * The clinic's own number for this patient, and **the one ref anywhere in the
 * app** (§5). It leads the meta line because it is what the desk copies onto the
 * top of the patient's page in the paper book, and a number you have to hunt for
 * is a number that gets written down wrong.
 *
 * Drawn as a chip rather than as another part of the line: the rest of the line
 * is muted mono figures, and a fourth one would read as a second phone number.
 * Outlined rather than filled, so it does not compete with `LEGACY` — that badge
 * is a warning and this is an identifier, and the loud one should stay the
 * warning.
 */
function RefChip({ value }: { value: string }) {
    return (
        <View style={styles.ref} accessibilityLabel={`Patient reference ${value}`}>
            <Text variant="tag" weight="bold" script="mono">
                {value}
            </Text>
        </View>
    );
}

/** `Female, 34` and `+201004001008` — with whatever of it the record actually holds. */
function metaParts(patient: Patient): string[] {
    const who = [sentenceCase(patient.gender), patient.age === null ? null : String(patient.age)]
        .filter(Boolean)
        .join(', ');

    // The old system's number is stored, and its presence is what `LEGACY` says,
    // but the figure itself is still not drawn. That was true when the phone was
    // the only number on this line and it is more true now there is a ref beside
    // it: three numbers in mono on one line is a line nobody reads. It belongs on
    // the Details tab if it belongs anywhere on screen.
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
    // Outlined and in ink, against `LEGACY`'s solid fill next to it. Same
    // vertical metrics as that badge so the two sit on one line without either
    // shifting the row's height.
    ref: {
        paddingHorizontal: space[2],
        paddingVertical: space[1],
        borderRadius: radius.sm,
        borderWidth: border.hair,
        borderColor: color.outline,
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
