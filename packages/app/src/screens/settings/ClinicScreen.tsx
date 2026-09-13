/**
 * Settings → Clinic: the name and number that identify the practice itself, and
 * where patient numbering carries on from.
 *
 * The hint under the first two says where the number shows up, because this is
 * the practice's number — the one on a receipt and at the top of a reminder
 * message — and not the number of any one branch. `branches` has no phone
 * column, so there is nothing to confuse it with yet.
 *
 * The patient number is the last one handed out, so a clinic moving over from a
 * paper count types the last number in its book and the next registration gets
 * the one after. It is only sent when it was changed: the server refuses a value
 * below a number a patient already has, and resending an untouched one would
 * race a registration made while the pane was open.
 */
import { MAX_PATIENT_REF } from '@lustre/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTRPC } from '../../api';
import { ActionBar, Callout, Card, NumericField, SectionLabel, TextField, Toast } from '../../components/ui';
import { space, Text } from '../../theme';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { errorText } from './data/errors';

export function ClinicScreen({ onBack }: { onBack: () => void }) {
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
    const patientNumberValue = patientNumber ?? (data ? String(data.patientRefLast) : '');

    const nameError = submitted && nameValue.trim() === '' ? 'The clinic needs a name.' : undefined;
    const phoneError = submitted && phoneValue.trim() === '' ? 'The clinic needs a phone number.' : undefined;
    const patientNumberInvalid = patientNumberValue === '' || Number(patientNumberValue) >= MAX_PATIENT_REF;
    const patientNumberError =
        submitted && patientNumberInvalid ? 'Type the last patient number used, or 0.' : undefined;

    function onSave() {
        setSubmitted(true);
        if (nameValue.trim() === '' || phoneValue.trim() === '' || patientNumberInvalid) return;

        const patientRefLast = Number(patientNumberValue);

        save.mutate(
            {
                clinicName: nameValue.trim(),
                clinicPhone: phoneValue.trim(),
                ...(patientRefLast !== data?.patientRefLast ? { patientRefLast } : {}),
            },
            {
                onSuccess: () => {
                    setName(undefined);
                    setPhone(undefined);
                    setPatientNumber(undefined);
                    setSubmitted(false);
                    setToast(true);
                },
            },
        );
    }

    return (
        <Pane
            title="Clinic"
            onBack={save.isPending ? () => {} : onBack}
            testID="settings-clinic"
            overlay={<Toast visible={toast} message="Clinic saved" onDismiss={() => setToast(false)} />}
            footer={
                data ? (
                    <ActionBar
                        primaryLabel={save.isPending ? 'Saving' : 'Save'}
                        onPrimary={onSave}
                        primaryLoading={save.isPending}
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
                        Appears on receipts and in reminder messages.
                    </Text>

                    <SectionLabel inset={false}>PATIENT NUMBERS</SectionLabel>

                    <Card padded style={styles.form}>
                        <NumericField
                            label="Last patient number"
                            required
                            value={patientNumberValue}
                            onChangeText={(text) => setPatientNumber(text.replace(/\D/g, '').slice(0, 10))}
                            placeholder="0"
                            error={patientNumberError}
                            keyboardType="number-pad"
                            size="body"
                            testID="clinic-patient-ref-last"
                        />
                    </Card>

                    <Text variant="footnote" tone="muted" style={styles.hint}>
                        The next patient registered gets the number after this one.
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
