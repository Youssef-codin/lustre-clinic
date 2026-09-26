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
 *
 * On a phone with both WhatsApp apps, each branch's number lives in one of them.
 * The button messages from the branch the day view is on; with none — a closed
 * day nobody has picked a branch on — it asks, unless every active branch lands
 * in the same place anyway.
 */

import type { WhatsAppApp } from '@lustre/shared';
import { Fragment, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { phoneText } from '../../../components/domain';
import { Sheet } from '../../../components/ui';
import { useT } from '../../../i18n';
import { border, color, containsArabic, radius, size, space, Text } from '../../../theme';
import { installedWhatsApp, openWhatsApp } from '../../../whatsapp';
import { currentBranchId } from '../../day/currentBranch';
import type { Branch, ClinicDay } from '../../day/data/types';
import type { Patient } from '../data/types';
import { sentenceCase } from './format';
import { CallIcon, WhatsAppIcon } from './icons';

export type PatientHeaderProps = {
    patient: Patient;
    /** Active branches; undefined until they load. */
    branches: readonly Branch[] | undefined;
    schedule: readonly ClinicDay[] | undefined;
    onFailed: (message: string) => void;
};

export function PatientHeader({ patient, branches, schedule, onFailed }: PatientHeaderProps) {
    const t = useT();
    const [choosing, setChoosing] = useState(false);
    // A ref, not state: the sheet's dismiss callback can be a render behind.
    const chosen = useRef<Branch | null>(null);

    const open = (url: string, failure: string) => {
        void Linking.openURL(url).catch(() => onFailed(failure));
    };

    const message = (app: WhatsAppApp) => {
        void openWhatsApp(whatsAppUrl(patient.phone), app).catch(() =>
            onFailed('WhatsApp could not be opened.'),
        );
    };

    function onWhatsApp() {
        const installed = installedWhatsApp();
        // With one app installed it is the only one that can open, whatever
        // the branch says, so there is nothing to wait for.
        if (!(installed.regular && installed.business)) {
            message('regular');
            return;
        }
        // Guessing here is how a message goes out from the other branch's number.
        if (!branches) {
            onFailed("The branches haven't loaded yet. Try again in a moment.");
            return;
        }
        const current = branches.find((b) => b.id === currentBranchId(schedule));
        if (current) {
            message(current.whatsappApp);
        } else if (new Set(branches.map((b) => b.whatsappApp)).size > 1) {
            setChoosing(true);
        } else {
            message(branches[0]?.whatsappApp ?? 'regular');
        }
    }

    return (
        <View style={styles.header}>
            <View style={styles.identity}>
                <Text variant="title" weight="semibold" style={styles.name}>
                    {patient.name}
                </Text>

                <View style={styles.meta}>
                    <RefChip value={patient.ref} />

                    {metaParts(patient, t).map((part, index) => (
                        <Fragment key={part}>
                            {/* A rule, not an interpunct: the design separates two
                                figures with a hairline bar so neither reads as
                                punctuation inside the number. */}
                            {index > 0 ? <View style={styles.divider} /> : null}
                            <Text
                                variant="subhead"
                                script={containsArabic(part) ? undefined : 'mono'}
                                tone="muted"
                            >
                                {part}
                            </Text>
                        </Fragment>
                    ))}
                </View>
            </View>

            <View style={styles.actions}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('WhatsApp {name}', { name: patient.name })}
                    onPress={onWhatsApp}
                    style={({ pressed }) => [styles.action, styles.whatsApp, pressed && styles.pressed]}
                >
                    <WhatsAppIcon size={18} stroke={color.inverse} />
                </Pressable>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Call {name}', { name: patient.name })}
                    onPress={() => open(`tel:${patient.phone}`, 'The dialler could not be opened.')}
                    style={({ pressed }) => [styles.action, styles.call, pressed && styles.pressed]}
                >
                    <CallIcon size={17} stroke={color.ink} />
                </Pressable>
            </View>

            <Sheet
                visible={choosing}
                onClose={() => setChoosing(false)}
                // Leaving the app waits for the sheet to finish leaving, as any
                // answer that changes the screen underneath does.
                onClosed={() => {
                    if (chosen.current) message(chosen.current.whatsappApp);
                    chosen.current = null;
                }}
                title="Message from which branch?"
            >
                <View style={styles.branches}>
                    {(branches ?? []).map((branch) => (
                        <Pressable
                            key={branch.id}
                            accessibilityRole="menuitem"
                            onPress={() => {
                                chosen.current = branch;
                                setChoosing(false);
                            }}
                            style={({ pressed }) => [styles.branch, pressed && styles.pressed]}
                        >
                            <Text variant="body" style={styles.branchName}>
                                {branch.name}
                            </Text>
                            <Text variant="subhead" tone="muted">
                                {branch.whatsappApp === 'business' ? t('WhatsApp Business') : t('WhatsApp')}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </Sheet>
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
 */
function RefChip({ value }: { value: string }) {
    const t = useT();
    return (
        <View style={styles.ref} accessibilityLabel={t('Patient reference {ref}', { ref: value })}>
            <Text variant="tag" weight="bold" script="mono">
                {value}
            </Text>
        </View>
    );
}

/** `Female, 34` and `+201004001008` — with whatever of it the record actually holds. */
function metaParts(patient: Patient, t: (copy: string) => string): string[] {
    const sex = sentenceCase(patient.gender);
    const who = [sex && t(sex), patient.age === null ? null : String(patient.age)].filter(Boolean).join(', ');

    // The old system's number is not one of these: a third mono figure on this
    // line would read as a second phone number.
    return [who, patient.phone && phoneText(patient.phone)].filter((part): part is string => Boolean(part));
}

/** `wa.me` wants the number without a `+` or separators. */
function whatsAppUrl(phone: string): string {
    return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
    identity: { flex: 1, gap: space[1.5] },
    name: { flexShrink: 1 },
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
    branches: { alignSelf: 'stretch' },
    branch: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        minHeight: size.row,
        paddingVertical: space[2],
    },
    branchName: { flex: 1 },
});
