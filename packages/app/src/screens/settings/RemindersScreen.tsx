/**
 * Settings → Reminders. Three timings and one message.
 *
 * The two halves answer different questions and the mockup keeps them apart:
 * "Remind before" is about the patient — how long before an appointment the
 * reminder becomes due — while "Notify me at" and "Repeat every" are about this
 * phone, the daily nudge that the pending list still has things in it. Mixing
 * them is how a clinic ends up messaging patients at 6 AM.
 *
 * The preview is not decoration either: the template is the only place in the
 * app where a typo reaches every patient, so the pane renders the message as it
 * will actually be sent, with sample values substituted for the tokens.
 *
 * That is also why the two halves commit differently. A stepper tap is a whole
 * decision and writes immediately. The template is composed rather than picked,
 * so it has an explicit Save: it used to write on blur, which on Android is a
 * blur that never comes if the pane is left by the header or the back gesture —
 * the edit was simply lost, with nothing on screen having claimed otherwise.
 * Saved is only shown once the server's own read has come back with the new
 * message, never on the strength of the local edit.
 *
 * Two shapes are the pane's own and are converted at this edge, in
 * `data/reminders`: the stepper steps minutes from midnight while the column is
 * a `time`, and the 320-character limit is the mockup's, tighter than the 1000
 * the server accepts.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTRPC } from '../../api';
import { formatClock12 } from '../../components/domain';
import {
    Button,
    Callout,
    Card,
    CardDivider,
    Chip,
    SectionLabel,
    Stepper,
    Textarea,
    usePullToRefresh,
} from '../../components/ui';
import { useNotificationsAllowed } from '../../notifications';
import { color, radius, space, Text } from '../../theme';
import { PlusIcon, WhatsAppIcon } from './components/icons';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { errorText } from './data/errors';
import {
    minutesFromTime,
    REMINDER_TOKENS,
    TEMPLATE_MAX,
    templateDraft,
    timeFromMinutes,
} from './data/reminders';

/**
 * The values the preview substitutes. Deliberately one fixed patient rather
 * than a real one off the list: a preview that names a real patient reads as a
 * message that has already been sent.
 */
const SAMPLE: Record<string, string> = {
    '{name}': 'Nour El-Sayed',
    '{date}': 'Thu 12 Jun',
    '{time}': '11:35 AM',
    '{branch}': 'Heliopolis',
    '{clinic}': 'Lustre Dental',
};

export function RemindersScreen({ onBack }: { onBack: () => void }) {
    const allowed = useNotificationsAllowed();
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const settings = useQuery(trpc.settings.get.queryOptions());

    const refetchSettings = () => queryClient.invalidateQueries(trpc.settings.pathFilter());

    // Two mutations over the one procedure, because they report to different
    // controls: a stepper mid-write must not put the template's Save button
    // into a spinner, and a failed template save must not disable the steppers.
    const saveTiming = useMutation(trpc.settings.update.mutationOptions({ onSuccess: refetchSettings }));
    const saveTemplate = useMutation(trpc.settings.update.mutationOptions({ onSuccess: refetchSettings }));

    const [template, setTemplate] = useState<string | null>(null);

    const pull = usePullToRefresh(settings.refetch, settings.isFetching);

    const data = settings.data;
    const draft = templateDraft(template, data?.reminderTemplate);
    const text = draft.text;
    const notifyAt = data ? minutesFromTime(data.reminderNotifyAt) : 0;

    // The edit is dropped when the refetch comes back carrying it, rather than
    // when the mutation resolves. Dropping it on the response would fall back
    // to the cached settings for the frame before the refetch lands, which is
    // the old wording flashing into the field the moment it was saved.
    if (template !== null && data?.reminderTemplate === template.trim()) setTemplate(null);

    // Between that response and that refetch the draft still differs from the
    // cache, so the button would read as unsaved again for a moment. It is the
    // value we sent and it landed, so it is still saving until confirmed.
    // Every edit goes through here so a failure cannot outlive the text that
    // caused it: the mutation holds its error until the next attempt, which
    // left "Not saved" standing over a draft that had never been sent.
    function editTemplate(next: string) {
        if (saveTemplate.isError) saveTemplate.reset();
        setTemplate(next);
    }

    const sent = saveTemplate.variables?.reminderTemplate;
    const confirming = saveTemplate.isSuccess && sent !== undefined && sent === template?.trim();
    const savingTemplate = saveTemplate.isPending || confirming;

    const write = saveTiming.mutate;

    return (
        <Pane title="Reminders" onBack={onBack} pull={pull} testID="settings-reminders">
            {settings.isLoading ? <SkeletonRows count={3} trailing /> : null}

            {settings.error ? (
                <ErrorState
                    message={errorText(settings.error)}
                    onRetry={settings.refetch}
                    retrying={settings.isFetching}
                />
            ) : null}

            {data ? (
                <>
                    {saveTiming.error ? (
                        <Callout tone="warning" title="Not saved">
                            {errorText(saveTiming.error)}
                        </Callout>
                    ) : null}

                    {/* A time set here cannot take effect while the OS is
                        blocking the app, and the pane would otherwise read back
                        perfectly against a phone that stays silent — which is
                        the whole failure this pane is meant to be the front of.
                        Said once, above the settings it disables, not as a
                        badge on each. */}
                    {allowed === 'blocked' ? (
                        <Callout tone="warning" title="Notifications are off for this app">
                            The daily reminder will not appear until notifications are turned on for Lustre
                            Clinic in Android settings. Everything below still saves.
                        </Callout>
                    ) : null}

                    <View style={styles.section}>
                        <SectionLabel inset={false}>TIMING</SectionLabel>

                        <Card>
                            <TimingRow
                                label="Remind before"
                                hint="How long before the appointment a reminder becomes due"
                                value={data.reminderLeadHours}
                                min={1}
                                max={96}
                                format={(hours) => `${hours} h`}
                                onChange={(reminderLeadHours) => write({ reminderLeadHours })}
                                saving={saveTiming.isPending}
                                testID="reminder-lead"
                            />
                            <CardDivider />
                            <TimingRow
                                label="Notify me at"
                                hint="Daily notification time, if any reminders are pending"
                                value={notifyAt}
                                min={6 * 60}
                                max={21 * 60}
                                step={60}
                                format={formatClock12}
                                onChange={(minutes) => write({ reminderNotifyAt: timeFromMinutes(minutes) })}
                                saving={saveTiming.isPending}
                                testID="reminder-notify"
                            />
                            <CardDivider />
                            <TimingRow
                                label="Repeat every"
                                hint="How often the notification repeats while reminders are still pending. Stops when the list is cleared or dismissed for the day, and never runs overnight."
                                value={data.reminderRepeatMinutes}
                                min={15}
                                max={120}
                                step={15}
                                format={(minutes) => `${minutes} min`}
                                onChange={(reminderRepeatMinutes) => write({ reminderRepeatMinutes })}
                                saving={saveTiming.isPending}
                                testID="reminder-repeat"
                            />
                        </Card>
                    </View>

                    <View style={styles.section}>
                        <SectionLabel
                            inset={false}
                            action={
                                <Text
                                    variant="caption"
                                    weight="medium"
                                    tone={text.length > TEMPLATE_MAX ? 'due' : 'muted'}
                                    script="mono"
                                >
                                    {`${text.length} / ${TEMPLATE_MAX}`}
                                </Text>
                            }
                        >
                            MESSAGE TEMPLATE
                        </SectionLabel>

                        <Textarea
                            value={text}
                            onChangeText={editTemplate}
                            error={draft.issue ?? undefined}
                            accessibilityLabel="Reminder message template"
                            testID="reminder-template"
                        />

                        <View style={styles.tokens}>
                            {REMINDER_TOKENS.map((token) => (
                                <Chip
                                    key={token}
                                    variant="new"
                                    label={token}
                                    icon={<PlusIcon size={11} stroke={color.muted} width={2.6} />}
                                    onPress={() => editTemplate(`${text} ${token}`)}
                                    testID={`reminder-token-${token}`}
                                />
                            ))}
                        </View>

                        {saveTemplate.error ? (
                            <Callout tone="warning" title="Not saved">
                                {errorText(saveTemplate.error)}
                            </Callout>
                        ) : null}

                        {/* Only once the refetch above has brought the new
                            wording back: until then the edit is on this phone
                            and nowhere else, and saying otherwise is the bug
                            this pane had. */}
                        {!draft.dirty && saveTemplate.isSuccess ? (
                            <Callout tone="reassurance" title="Saved">
                                Patients will get this wording from the next reminder on.
                            </Callout>
                        ) : null}

                        {/* Shown from the first edit rather than always, so a
                            pane nobody has typed in offers nothing to press. */}
                        {draft.dirty || savingTemplate ? (
                            <Button
                                label="Save message"
                                onPress={() => saveTemplate.mutate({ reminderTemplate: text.trim() })}
                                loading={savingTemplate}
                                disabled={!draft.canSave || savingTemplate}
                                block
                                testID="reminder-template-save"
                            />
                        ) : null}
                    </View>

                    <View style={styles.section}>
                        <SectionLabel inset={false}>PREVIEW</SectionLabel>

                        <View style={styles.preview}>
                            <View style={styles.previewHead}>
                                <WhatsAppIcon size={15} />
                                <Text variant="eyebrow" tone="inverse" style={styles.channel}>
                                    WHATSAPP
                                </Text>
                                <Text variant="caption" tone="inverse" script="mono" style={styles.sendAt}>
                                    {formatClock12(notifyAt)}
                                </Text>
                            </View>

                            <View style={styles.bubble}>
                                <Text variant="callout">{fill(text)}</Text>
                            </View>

                            <Text variant="caption" tone="inverse" script="mono" style={styles.sampleNote}>
                                Sample patient — real values are filled per appointment.
                            </Text>
                        </View>
                    </View>
                </>
            ) : null}
        </Pane>
    );
}

function fill(template: string): string {
    return REMINDER_TOKENS.reduce((text, token) => text.split(token).join(SAMPLE[token] ?? token), template);
}

type TimingRowProps = {
    label: string;
    hint: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    format: (value: number) => string;
    onChange: (value: number) => void;
    saving: boolean;
    testID: string;
};

function TimingRow({ label, hint, value, min, max, step, format, onChange, saving, testID }: TimingRowProps) {
    return (
        <View style={styles.timing}>
            <View style={styles.timingText}>
                <Text variant="callout" weight="semibold">
                    {label}
                </Text>
                <Text variant="footnote" tone="muted">
                    {hint}
                </Text>
            </View>

            <Stepper
                value={value}
                min={min}
                max={max}
                step={step}
                format={format}
                onChange={onChange}
                disabled={saving}
                accessibilityLabel={label}
                testID={testID}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    section: { gap: space[2] },

    timing: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[3.5],
        paddingVertical: space[3],
    },
    timingText: { flex: 1, minWidth: 0, gap: space[0.5] },

    tokens: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1.5] },

    preview: { padding: space[3.5], borderRadius: radius.xl2, backgroundColor: color.inkDeep },
    previewHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    channel: { flex: 1, opacity: 0.5 },
    sendAt: { opacity: 0.4 },

    // A received bubble: square on the corner it grows from, round elsewhere.
    bubble: {
        marginTop: space[3],
        paddingVertical: space[3],
        paddingHorizontal: space[3.5],
        borderRadius: radius.xl,
        borderEndStartRadius: space[1.5],
        backgroundColor: color.surface,
    },
    sampleNote: { marginTop: space[2.5], opacity: 0.42 },
});
