/**
 * Settings → Clinic: the name and number that identify the practice itself,
 * where patient numbering carries on from, and where a patient who predates the
 * clinic's move to this app has their carried-over money and history dated.
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
 *
 * ## The migration cutoff
 *
 * Which branch and which date an old patient's opening balance and imported
 * history hang on. It is asked here, once, rather than on the registration form
 * four hundred times: it is a fact about the clinic and not about the patient.
 * Until it is set, registering an old patient who owes something or had work
 * done is refused — the alternative is inventing a branch and a day the clinic
 * was open. A patient who brings neither needs none of it.
 */
import type { CopyVars } from '@lustre/shared';
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
    Select,
    TextField,
    Toast,
} from '../../components/ui';
import { useT } from '../../i18n';
import { space, Text } from '../../theme';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import {
    cutoffDigits,
    cutoffDigitsOf,
    cutoffDisplay,
    cutoffError,
    cutoffIso,
    migrationIssue,
    patientNumberDigits,
    patientNumberError,
} from './data/clinic';
import { errorText } from './data/errors';

export function ClinicScreen({ onBack }: { onBack: () => void }) {
    const t = useT();
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const clinic = useQuery(trpc.settings.get.queryOptions());
    // Active branches only — a balance is dated at a branch that still exists.
    const branches = useQuery(trpc.branch.list.queryOptions({ includeInactive: false }));
    // How much has actually come across. It reads beside the cutoff because
    // that is the only place in the app the changeover is visible at all now.
    const carried = useQuery(trpc.migration.progress.queryOptions());
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
    const [cutoff, setCutoff] = useState<string>();
    const [branchId, setBranchId] = useState<string | null>();
    const [submitted, setSubmitted] = useState(false);
    const [toast, setToast] = useState(false);

    const data = clinic.data;
    const nameValue = name ?? data?.clinicName ?? '';
    const phoneValue = phone ?? data?.clinicPhone ?? '';
    const patientNumberValue = patientNumber ?? (data ? String(data.patientRefNext) : '');
    const cutoffValue = cutoff ?? cutoffDigitsOf(data?.migrationCutoffDate ?? null);
    const branchValue = branchId !== undefined ? branchId : (data?.migrationBranchId ?? null);

    const nameError = submitted && nameValue.trim() === '' ? 'The clinic needs a name.' : undefined;
    const phoneError = submitted && phoneValue.trim() === '' ? 'The clinic needs a phone number.' : undefined;
    const patientNumberIssue = patientNumberError(patientNumberValue);
    const cutoffIssue = cutoffError(cutoffValue);
    // Both halves or neither — shown only once Save has been pressed, because
    // one half is exactly what the pane looks like while the other is being set.
    const pairIssue = cutoffIssue === null ? migrationIssue(cutoffValue, branchValue) : null;

    function onSave() {
        setSubmitted(true);
        if (nameValue.trim() === '' || phoneValue.trim() === '') return;
        if (patientNumberIssue !== null || cutoffIssue !== null || pairIssue !== null) return;

        const patientRefNext = Number(patientNumberValue);
        const migrationCutoffDate = cutoffValue === '' ? null : cutoffIso(cutoffValue);

        save.mutate(
            {
                clinicName: nameValue.trim(),
                clinicPhone: phoneValue.trim(),
                ...(patientRefNext !== data?.patientRefNext ? { patientRefNext } : {}),
                ...(migrationCutoffDate !== (data?.migrationCutoffDate ?? null)
                    ? { migrationCutoffDate }
                    : {}),
                ...(branchValue !== (data?.migrationBranchId ?? null)
                    ? { migrationBranchId: branchValue }
                    : {}),
            },
            {
                onSuccess: () => {
                    setName(undefined);
                    setPhone(undefined);
                    setPatientNumber(undefined);
                    setCutoff(undefined);
                    setBranchId(undefined);
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

                    <SectionLabel inset={false}>OLD PATIENTS</SectionLabel>

                    <Card padded style={styles.form}>
                        <NumericField
                            label="Cutoff date"
                            value={cutoffDisplay(cutoffValue)}
                            onChangeText={(text) => setCutoff(cutoffDigits(text))}
                            placeholder="DD / MM / YYYY"
                            error={cutoffIssue ?? undefined}
                            keyboardType="number-pad"
                            size="body"
                            testID="clinic-migration-cutoff"
                        />
                        <Select
                            label="Branch"
                            value={branchValue ?? ''}
                            onChange={(value) => setBranchId(value === '' ? null : value)}
                            options={[
                                { value: '', label: 'Not set' },
                                ...(branches.data ?? []).map((branch) => ({
                                    value: branch.id,
                                    label: branch.name,
                                })),
                            ]}
                            testID="clinic-migration-branch"
                        />
                        {submitted && pairIssue ? (
                            <Text variant="caption" tone="due">
                                {t(pairIssue)}
                            </Text>
                        ) : null}
                    </Card>

                    <Text variant="footnote" tone="muted" style={styles.hint}>
                        {t(
                            'The day the old system stopped being the truth. A patient registered with an old number who owes money or had work recorded has it dated here. Leave it unset if nothing is being carried over.',
                        )}
                        {carried.data && carried.data.oldPatients > 0
                            ? ` ${carriedSoFar(t, carried.data)}`
                            : ''}
                    </Text>
                </>
            ) : null}
        </Pane>
    );
}

/**
 * What has come across, in one sentence. Plural-aware because "1 patients" on a
 * settings pane is the kind of thing that makes the rest of it look untended.
 */
function carriedSoFar(
    t: (copy: string, vars?: CopyVars) => string,
    progress: { oldPatients: number; openingBalances: number },
): string {
    const patients = t(progress.oldPatients === 1 ? '{count} patient' : '{count} patients', {
        count: progress.oldPatients,
    });
    if (progress.openingBalances === 0) return t('{patients} carried over so far.', { patients });

    return t('{patients} carried over so far, {owing} of them still owing money.', {
        patients,
        owing: progress.openingBalances,
    });
}

const styles = StyleSheet.create({
    form: { gap: space[4] },
    hint: { paddingHorizontal: space[0.5] },
});
