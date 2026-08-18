/**
 * Settings → Clinic: the name and number that identify the practice itself.
 *
 * Two fields and a save bar, and the hint under them is the whole reason the
 * pane is separate from Branches: this is what a patient sees on a receipt and
 * at the top of a reminder message, while the number they would actually call
 * is the branch's. Editing the wrong one is the mistake worth preventing, so
 * the pane says which is which rather than listing four fields together.
 */
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ActionBar, Callout, Card, SectionLabel, TextField, Toast } from '../../components/ui';
import { space, Text } from '../../theme';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { api } from './data/_LocalApi';
import { errorMessage, useMutation, useQuery } from './data/hooks';

export function ClinicScreen({ onBack }: { onBack: () => void }) {
    const clinic = useQuery(useCallback(() => api.clinic.get(), []));
    const save = useMutation((input: { name: string; phone: string }) => api.clinic.update(input));

    // `undefined` means "not edited": the fields show what the server said
    // until someone types, so a reload landing behind an untouched pane is not
    // overwritten by a stale draft.
    const [name, setName] = useState<string>();
    const [phone, setPhone] = useState<string>();
    const [submitted, setSubmitted] = useState(false);
    const [toast, setToast] = useState(false);

    const data = clinic.data;
    const nameValue = name ?? data?.name ?? '';
    const phoneValue = phone ?? data?.phone ?? '';

    const nameError = submitted && nameValue.trim() === '' ? 'The clinic needs a name.' : undefined;
    const phoneError = submitted && phoneValue.trim() === '' ? 'The clinic needs a phone number.' : undefined;

    async function onSave() {
        setSubmitted(true);
        if (nameValue.trim() === '' || phoneValue.trim() === '') return;

        const saved = await save.run({ name: nameValue, phone: phoneValue });
        if (!saved) return;

        setName(undefined);
        setPhone(undefined);
        setSubmitted(false);
        setToast(true);
        clinic.reload();
    }

    return (
        <Pane
            title="Clinic"
            onBack={save.pending ? () => {} : onBack}
            testID="settings-clinic"
            overlay={<Toast visible={toast} message="Clinic saved" onDismiss={() => setToast(false)} />}
            footer={
                data ? (
                    <ActionBar
                        primaryLabel={save.pending ? 'Saving' : 'Save'}
                        onPrimary={onSave}
                        primaryLoading={save.pending}
                        testID="clinic-save"
                    />
                ) : undefined
            }
        >
            {clinic.loading ? <SkeletonRows count={2} /> : null}

            {clinic.error ? (
                <ErrorState
                    message={errorMessage(clinic.error) ?? ''}
                    onRetry={clinic.reload}
                    retrying={clinic.reloading}
                />
            ) : null}

            {data ? (
                <>
                    {save.error ? (
                        <Callout tone="warning" title="Not saved">
                            {errorMessage(save.error) ?? ''}
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
                        Appears on receipts and in reminder messages. Branch phone numbers are set per branch.
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
