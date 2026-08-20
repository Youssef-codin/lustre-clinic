/**
 * A visit opened from outside the day view — a row in a patient's history. It
 * is the whole stack in one component (read → edit → pay) so a caller in
 * another cluster needs nothing from `day/data`: two ids in, a close callback
 * out. `DayScreen` keeps its own copy of the stack because it already holds the
 * appointment and the visit and would only be handing them back to be fetched
 * again.
 *
 * The two reads go together because the screens want both: the visit carries
 * the lines and the payments, and the appointment carries whose visit it is and
 * when. Neither is on the history row.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, PushView } from '../../../components/ui';
import { color, size, space, Text } from '../../../theme';
import { api, useLocalQuery, type Visit } from '../data';
import { describeError } from '../errors';
import { VisitPaymentScreen } from './VisitPaymentScreen';
import { VisitScreen } from './VisitScreen';
import { VisitViewScreen } from './VisitViewScreen';

export type VisitPageProps = {
    appointmentId: string;
    visitId: string;
    onClose: () => void;
    /** Something was written, so whatever is underneath is now stale. */
    onChanged?: () => void;
};

type Step = 'view' | 'treatment' | 'payment';

export function VisitPage({ appointmentId, visitId, onClose, onChanged }: VisitPageProps) {
    const [step, setStep] = useState<Step>('view');
    // The reopened / repriced visit, once a write has moved it on from what was
    // read. Null means "still what the server first said".
    const [edited, setEdited] = useState<Visit | null>(null);

    const appointment = useLocalQuery(`appointment:${appointmentId}`, () =>
        api.appointmentById(appointmentId),
    );
    const loaded = useLocalQuery(`visit:${visitId}`, () => api.visitById(visitId));

    const visit = edited ?? loaded.data;
    const failure = appointment.error ?? loaded.error;

    function close() {
        if (edited) onChanged?.();
        onClose();
    }

    if (failure) {
        return (
            <View style={styles.state}>
                <Banner tone="warning" message={describeError(failure).title} />
                <View style={styles.actions}>
                    <Button label="Try again" variant="text" onPress={appointment.refetch} />
                    <Button label="Back" variant="ghost" onPress={onClose} />
                </View>
            </View>
        );
    }

    if (!appointment.data || !visit) {
        return (
            <View style={styles.state}>
                <Text variant="subhead" tone="muted">
                    Reading the visit…
                </Text>
            </View>
        );
    }

    return (
        <>
            <VisitViewScreen
                appointment={appointment.data}
                visit={visit}
                onBack={close}
                // Nothing is written on the way in, so the record underneath is
                // not stale yet — `onConfirm` is what makes it so.
                onEdit={() => setStep('treatment')}
            />

            <PushView visible={step !== 'view'} testID="visit-page-treatment">
                <VisitScreen
                    key={`edit:${visit.id}:${step === 'view' ? 'idle' : 'live'}`}
                    appointment={appointment.data}
                    visit={visit}
                    // Always a checkout here: this page is opened off a history
                    // row, so the arrival is long past. And always a finished
                    // one — the visit was closed and has been reopened to be
                    // corrected, so the patient is not in the building and the
                    // desk is not anywhere they can be sent.
                    mode="checkout"
                    standing="finished"
                    onBack={() => setStep('view')}
                    onConfirm={(priced) => {
                        setEdited(priced);
                        setStep('payment');
                    }}
                />

                <PushView visible={step === 'payment'} testID="visit-page-payment">
                    <VisitPaymentScreen
                        key={`pay:${visit.id}:${visit.chargedTotal}`}
                        appointment={appointment.data}
                        visit={visit}
                        // Always: this page only ever reaches the money by way
                        // of reopening a visit that was checked out.
                        correcting
                        onBack={() => setStep('treatment')}
                        onClosed={() => {
                            onChanged?.();
                            onClose();
                        }}
                    />
                </PushView>
            </PushView>
        </>
    );
}

const styles = StyleSheet.create({
    state: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[3],
        paddingHorizontal: size.gutter,
        backgroundColor: color.canvas,
    },
    actions: { flexDirection: 'row', gap: space[2] },
});
