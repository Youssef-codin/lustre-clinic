// The **Old patient** part of the New patient screen: the switch, and the
// three things a patient the clinic already had brings with them.
//
// There is no mockup for it — the Open Design folder has fourteen screens and
// none of them is this one — so it is built from the tokens and from the shapes
// `patient-edit.html` already settles. It is two pieces, not one block: the
// switch is the last row of the BASICS card (`OldPatientRows`, passed in as
// its `trailing`), with the ref and the balance opening under it in the same
// card — it is one more fact read off the paper file, next to the age and the
// sex, not a section of its own. The procedures are a list under their own
// eyebrow below the card (`OldProcedures`). Recorded in DECISIONS.md rather
// than passed off as drawn.
//
// Off is the default and off sends nothing. The fields keep what is in them
// while the switch is off rather than being wiped — a mis-tap that lost a typed
// number would be worse than one that did not — and only the submit reads the
// switch (`patientForm.createInputOf`).
//
// ## Three fields, and why only three
//
// The number on the paper file, what they owed on it, and what the file says
// was done. Nothing about the *cutoff* is here: which branch and which date the
// carried-over history hangs on is a fact about the clinic, answered once in
// Settings → Clinic, not four hundred times at the desk. The old Data entry
// screen asked for it per session and this is the thing that replaced it.
//
// ## The procedure list
//
// It is `HistoricalProcedures`, shared with the editor: the same work turns up
// at registration and again a year later when the paper file does, and two
// lists of it would be two things to keep in step. All this file adds is the
// `Reveal` around it, because here the list belongs to the switch.
// biome-ignore lint/style/noRestrictedImports: the Reveal tween is an animation driven by the switch
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import {
    CardDivider,
    duration,
    easing,
    NumericField,
    Switch,
    TextField,
    useReducedMotion,
} from '../../../components/ui';
import { useT } from '../../../i18n';
import { space, Text } from '../../../theme';
import type { OldField, OldPatientForm, PatientForm } from '../patientForm';
import { owesInput } from '../patientForm';
import { HistoricalProcedures } from './HistoricalProcedures';

export type OldPatientProps = {
    form: PatientForm;
    onChange: (patch: Partial<PatientForm>) => void;
    /** Required and still empty — the label goes `due` and the footer counts it. */
    blank: OldField[];
    /** Typed and wrong, which does have something to correct. */
    errors: Partial<Record<OldField, string>>;
};

/** The switch row and, once it is on, the ref and the balance — inside the BASICS card. */
export function OldPatientRows({ form, onChange, blank, errors }: OldPatientProps) {
    const t = useT();
    const old = form.old;
    const change = (patch: Partial<OldPatientForm>) => onChange({ old: { ...old, ...patch } });

    return (
        <>
            <View style={styles.switchRow}>
                <View style={styles.switchText}>
                    <Text variant="callout" weight="medium">
                        {t('Already a patient here')}
                    </Text>
                    <Text variant="caption" tone="muted">
                        {t('They have a number from before the clinic moved over.')}
                    </Text>
                </View>
                <Switch
                    value={old.on}
                    onValueChange={(on) => change({ on })}
                    accessibilityLabel="Old patient"
                    testID="patient-old-switch"
                />
            </View>

            <Reveal open={old.on}>
                <CardDivider />
                <View style={styles.fields}>
                    <TextField
                        label="Old ref number"
                        required
                        value={old.ref}
                        onChangeText={(ref) => change({ ref })}
                        placeholder="710"
                        due={blank.includes('ref')}
                        hint="The number on the front of their paper file. It becomes their patient number here."
                        autoCapitalize="characters"
                        testID="patient-old-ref"
                    />
                    <NumericField
                        label="Owes"
                        value={old.owes}
                        onChangeText={(text) => change({ owes: owesInput(text) })}
                        placeholder="0"
                        prefix="EGP"
                        error={errors.owes}
                        keyboardType="number-pad"
                        size="body"
                        hint="What they still owed the old system. Leave blank if nothing."
                        testID="patient-old-owes"
                    />
                </View>
            </Reveal>
        </>
    );
}

/** The OLD PROCEDURES list under the card, shown while the switch is on. */
export function OldProcedures({ form, onChange }: Pick<OldPatientProps, 'form' | 'onChange'>) {
    const old = form.old;

    return (
        <Reveal open={old.on}>
            <HistoricalProcedures
                title="OLD PROCEDURES"
                entries={old.procedures}
                onChange={(procedures) => onChange({ old: { ...old, procedures } })}
                enabled={old.on}
            />
        </Reveal>
    );
}

/**
 * The switch's fields and list open and close rather than appearing: a short height
 * tween with the content fading a touch ahead of it, the same shape as the
 * agenda's *Before this* fold. Closed content stays mounted so the fields keep
 * what was typed (see the file comment) and so there is a height to open to —
 * it is clipped, untouchable, and out of the accessibility tree.
 */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
    const [contentHeight, setContentHeight] = useState(0);
    const reducedMotion = useReducedMotion();
    const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

    useEffect(() => {
        const to = open ? 1 : 0;
        if (reducedMotion) {
            progress.setValue(to);
            return;
        }
        const tween = Animated.timing(progress, {
            toValue: to,
            duration: duration.fadeup,
            easing: easing.promote,
            // `height` is layout, so the native driver is out.
            useNativeDriver: false,
        });
        tween.start();
        return () => tween.stop();
    }, [open, reducedMotion, progress]);

    const height = progress.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] });
    const opacity = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.85, 1] });
    const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-space[2], 0] });

    return (
        <Animated.View
            style={[styles.reveal, { height, opacity }]}
            pointerEvents={open ? 'auto' : 'none'}
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        >
            <Animated.View
                onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
                style={[styles.revealBody, { transform: [{ translateY }] }]}
            >
                {children}
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[3.5],
        paddingVertical: space[3],
    },
    switchText: { flex: 1, gap: space[0.5] },

    reveal: { overflow: 'hidden' },
    revealBody: { position: 'absolute', start: 0, end: 0, top: 0 },

    fields: { paddingHorizontal: space[3.5], paddingVertical: space[3.5], gap: space[4] },
});
