/**
 * Settings → Clinic: the name and number that identify the practice itself,
 * and where patient numbering carries on from.
 *
 * The hint under the first two says where the number shows up, because this is
 * the practice's number — the one on a receipt and at the top of a reminder
 * message — and not the number of any one branch. `branches` has no phone
 * column, so there is nothing to confuse it with yet.
 *
 * ## The patient number
 *
 * It is the number the **next new patient will be given**. It used to be the
 * last one handed out, labelled `Last patient number`, and a clinic that typed
 * 910 got 911 — because the field said "last" and everybody read it as "next".
 * It is only sent when it was changed: the server refuses a value at or below a
 * number a patient already has, and resending an untouched one would race a
 * registration made while the pane was open.
 *
 * An **old** patient never takes a number from this sequence — they keep the
 * one on their paper file (New patient → Old patient) — so this only ever moves
 * for a patient the clinic has genuinely not seen before.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTRPC } from '../../api';
import {
    ActionBar,
    Callout,
    Card,
    NumericField,
    SectionLabel,
    TextField,
    Toast,
    usePendingAction,
} from '../../components/ui';
import { useT } from '../../i18n';
import { space, Text } from '../../theme';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { patientNumberDigits, patientNumberError } from './data/clinic';
import { errorText } from './data/errors';

export function ClinicScreen({ onBack }: { onBack: () => void }) {
    const t = useT();
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const clinic = useQuery(trpc.settings.get.queryOptions());
    const save = useMutation(
        trpc.settings.update.mutationOptions({
            onSuccess: () => queryClient.invalidateQueries(trpc.settings.pathFilter()),
        }),
    );

    // `undefined` means "not edited": the fields show what the server said
    // until someone types, so a refetch landing behind an untouched pane is not
    // overwritten by a stale draft.
    const [name, setName] = useState<string>();
    const [phone, setPhone] = useState<string>();
    const [patientNumber, setPatientNumber] = useState<string>();
    const [submitted, setSubmitted] = useState(false);
    const [toast, setToast] = useState(false);

    const data = clinic.data;
    const nameValue = name ?? data?.clinicName ?? '';
    const phoneValue = phone ?? data?.clinicPhone ?? '';
    const patientNumberValue = patientNumber ?? (data ? String(data.patientRefNext) : '');

    const nameError = submitted && nameValue.trim() === '' ? 'The clinic needs a name.' : undefined;
    const phoneError = submitted && phoneValue.trim() === '' ? 'The clinic needs a phone number.' : undefined;
    const patientNumberIssue = patientNumberError(patientNumberValue);

    /**
     * The pane's one write, behind a ref the second tap cannot get past —
     * `isPending` is state, and a Save pressed twice in a frame bumps
     * `patientRefNext` on a pane whose draft has not been cleared yet.
     */
    const write = usePendingAction((job: () => Promise<unknown>) => job());

    function onSave() {
        setSubmitted(true);
        if (nameValue.trim() === '' || phoneValue.trim() === '') return;
        if (patientNumberIssue !== null) return;

        const patientRefNext = Number(patientNumberValue);

        write.run(async () => {
            await save.mutateAsync({
                clinicName: nameValue.trim(),
                clinicPhone: phoneValue.trim(),
                ...(patientRefNext !== data?.patientRefNext ? { patientRefNext } : {}),
            });
            setName(undefined);
            setPhone(undefined);
            setPatientNumber(undefined);
            setSubmitted(false);
            setToast(true);
        });
    }

    return (
        <Pane
            title="Clinic"
            onBack={write.pending ? () => {} : onBack}
            testID="settings-clinic"
            overlay={<Toast visible={toast} message="Clinic saved" onDismiss={() => setToast(false)} />}
            footer={
                data ? (
                    <ActionBar
                        primaryLabel={write.pending ? 'Saving' : 'Save'}
                        onPrimary={onSave}
                        primaryLoading={write.pending}
                        testID="clinic-save"
                    />
                ) : undefined
            }
        >
            {clinic.isLoading ? <SkeletonRows count={3} /> : null}

            {clinic.error ? (
                <ErrorState
                    message={errorText(clinic.error)}
                    onRetry={clinic.refetch}
                    retrying={clinic.isFetching}
                />
            ) : null}

            {data ? (
                <>
                    {save.error ? (
                        <Callout tone="warning" title="Not saved">
                            {errorText(save.error)}
                        </Callout>
                    ) : null}

                    <SectionLabel inset={false}>CLINIC</SectionLabel>

                    <Card padded style={styles.form}>
                        <TextField
                            label="Clinic name"
                            required
                            value={nameValue}
                            onChangeText={setName}
                            placeholder="Lustre Dental"
                            error={nameError}
                            autoCapitalize="words"
                            testID="clinic-name"
                        />
                        <TextField
                            label="Phone"
                            required
                            value={phoneValue}
                            onChangeText={setPhone}
                            placeholder="0100 000 0000"
                            error={phoneError}
                            keyboardType="phone-pad"
                            testID="clinic-phone"
                        />
                    </Card>

                    <Text variant="footnote" tone="muted" style={styles.hint}>
                        {t('Appears on receipts and in reminder messages.')}
                    </Text>

                    <SectionLabel inset={false}>PATIENT NUMBERS</SectionLabel>

                    <Card padded style={styles.form}>
                        <NumericField
                            label="Next patient number"
                            required
                            value={patientNumberValue}
                            onChangeText={(text) => setPatientNumber(patientNumberDigits(text))}
                            placeholder="1"
                            error={submitted ? (patientNumberIssue ?? undefined) : undefined}
                            keyboardType="number-pad"
                            size="body"
                            testID="clinic-patient-ref-next"
                        />
                    </Card>

                    <Text variant="footnote" tone="muted" style={styles.hint}>
                        {t(
                            'The next new patient registered gets this number, and the one after gets the number after it. A patient entered with an old number keeps that number instead, and does not use this one up.',
                        )}
                    </Text>
                </>
            ) : null}
        </Pane>
    );
}

const styles = StyleSheet.create({
    form: { gap: space[4] },
    hint: { paddingHorizontal: space[0.5] },
});
