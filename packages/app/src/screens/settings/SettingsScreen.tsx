/**
 * Settings — one screen, not two: the role is a device-local preference
 * (`shell/roleStore`), not a permission, so the doctor's rows are simply absent
 * for the secretary. There is no navigator yet, so this screen is its own stack
 * (`src/navigation`) drawn with `ui/PushView`; lifting the panes into a real
 * navigator is `push` → `navigate`. The index is the root, and every pane sits
 * one deep on top of it — a pane's own editors push again from inside it.
 *
 * The index is a summary, not a menu. `settings.html` fills every row's sub
 * with that row's current answer — "default 30 min", "2 active · 1 inactive" —
 * so most questions are answered without opening anything, which is why the
 * screen loads all six summaries up front and shows skeleton rows rather than
 * drawing labels with empty subs under them.
 */
import type { ClientRole } from '@lustre/shared';
import { useQuery } from '@tanstack/react-query';
import { memo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { allowsDemo, BUILD_VARIANT, type RouterOutput, resetDemoData, useDemoMode, useTRPC } from '../../api';
import { BrandMark, formatClock12 } from '../../components/domain';
import {
    Button,
    Card,
    CardDivider,
    PushView,
    ScreenHeader,
    SectionLabel,
    Toast,
    useAfterSheet,
    usePendingAction,
} from '../../components/ui';
// The store module directly, not the `shell` barrel: that barrel exports
// `AppShell`, which imports this screen.
import { setLocale, useLocale, useT } from '../../i18n';
import { isOpen, rendered, useRouteStack } from '../../navigation';
import { CRASH_REPORTS_ON, reportProblem } from '../../reporting';
import { setRole, useRole } from '../../shell/roleStore';
import { color, size, space, Text } from '../../theme';
import { AppointmentsScreen } from './AppointmentsScreen';
import { AppScreen } from './AppScreen';
import { BranchesScreen } from './BranchesScreen';
import { ClinicScreen } from './ClinicScreen';
import { DriveSignInSheet } from './components/DriveSignInSheet';
import { IdentityCard } from './components/IdentityCard';
import {
    DriveAlertIcon,
    EnterDemoIcon,
    LeaveDemoIcon,
    ReportProblemIcon,
    ResetDemoIcon,
    SettingsIcon,
} from './components/icons';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { RoleSwitchSheet } from './components/RoleSwitchSheet';
import { SettingsRow } from './components/SettingsRow';
import { installedVersion, useApkUpdate } from './data/appUpdate';
import { versionLine } from './data/appVersion';
import { type BackupView, backupView, driveSignInError } from './data/backups';
import { useConnectionView } from './data/connection';
import { useDriveSignIn } from './data/driveSignIn';
import { errorText } from './data/errors';
import { minutesFromTime } from './data/reminders';
import { PatientFieldsScreen } from './PatientFieldsScreen';
import { ProceduresScreen } from './ProceduresScreen';
import { RemindersScreen } from './RemindersScreen';
import { WorkingHoursScreen } from './WorkingHoursScreen';

/** The panes over the index. The index itself is the root and is not one. */
type Route =
    | 'app'
    | 'appointments'
    | 'reminders'
    | 'clinic'
    | 'branches'
    | 'hours'
    | 'procedures'
    | 'patientFields';

const ROLE_NAME: Record<ClientRole, string> = { doctor: 'Doctor', secretary: 'Secretary' };
const ROLE_INITIAL: Record<ClientRole, string> = { doctor: 'D', secretary: 'S' };

type SettingsScreenProps = {
    /**
     * Bumped when the fourth tab is tapped while it is already up. Home is the
     * index; the panes above it are all reads and settings already written, so
     * there is nothing in flight to protect.
     */
    goHome?: number;
};

function SettingsScreenView({ goHome = 0 }: SettingsScreenProps) {
    const [switching, setSwitching] = useState(false);
    // The switch redraws every tab in the shell, so it waits for the sheet that
    // asked for it to be off the screen.
    const roleDone = useAfterSheet();
    const [seenHome, setSeenHome] = useState(goHome);

    /**
     * The panes, and the hardware back with them. Nothing here answers back by
     * hand: the hook makes it `pop`, which is the same function the headers'
     * Back calls, so the two cannot come to disagree.
     *
     * What a pane has open inside itself stays the pane's own. An editor over
     * `ProceduresScreen` mounted after this stack did, and a handler that
     * mounted later is asked first, so it closes before this is reached.
     */
    const routes = useRouteStack<Route>();
    const back = routes.pop;

    if (goHome !== seenHome) {
        setSeenHome(goHome);
        routes.popToRoot();
        setSwitching(false);
    }

    const demo = useDemoMode();

    // From the store rather than from a prop, like the locale below it: the
    // shell holds neither, and this screen is where both are changed.
    const { role } = useRole();
    const locale = useLocale();
    const t = useT();

    const summary = useSummary();
    const connection = useConnectionView();
    const apkUpdate = useApkUpdate();
    const backups = useBackups();
    const driveSignIn = useDriveSignIn();
    const [linkingDrive, setLinkingDrive] = useState(false);

    /**
     * The confirm closes the sheet before Google's screen opens, so `linking`
     * — which only covers the last leg, the code exchange — is not what stops a
     * second tap launching a second `AuthSession`. The guard's ref is: it holds
     * from the tap to the account being linked, and clears on failure so the
     * sign-in can be tried again.
     */
    const link = usePendingAction(linkDrive);

    async function linkDrive() {
        setLinkingDrive(false);
        // `usePendingAction` swallows a rejection, so one that escapes the
        // sign-in is caught here and said, rather than clearing the spinner silently.
        const result = await driveSignIn
            .signIn()
            .catch(() => ({ kind: 'failed' as const, code: 'INTERNAL' }));
        if (result.kind === 'cancelled') return;
        setToast(
            result.kind === 'linked'
                ? result.account
                    ? t('Backups now go to {account}', { account: result.account })
                    : 'Google Drive linked'
                : driveSignInError(result.code),
        );
    }

    const isDoctor = role === 'doctor';

    const [toast, setToast] = useState<string | null>(null);
    const reports = CRASH_REPORTS_ON && !demo.enabled;

    function report() {
        const result = reportProblem();
        setToast(
            result.queued
                ? locale === 'ar'
                    ? `تم وضع التقرير في قائمة الإرسال · المرجع ${result.ref}`
                    : `Report queued · ref ${result.ref}`
                : t('Problem reports are off on this build'),
        );
    }

    // Not behind the summary: a report is most wanted when the server is not
    // answering and the summary never loads.
    const problem = (
        <Group title={t('HELP')}>
            <SettingsRow
                icon={<ReportProblemIcon />}
                label={t('Report a problem')}
                sub={t(reports ? 'Sends your last taps, never patient details' : 'Off on this build')}
                onPress={report}
                testID="settings-report-problem"
            />
        </Group>
    );

    return (
        <View style={styles.screen}>
            <ScreenHeader
                title={t('Settings')}
                trailing={<BrandMark variant="lockup" size={13} tone="muted" />}
            />

            <IdentityCard
                roleName={ROLE_NAME[role]}
                roleInitial={ROLE_INITIAL[role]}
                clinicName={summary.data?.clinicName ?? ''}
                connection={connection}
                onSwitchRole={() => setSwitching(true)}
                testID="settings-identity"
            />

            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                {/* A card in Settings, never a modal over the day: installing
                    leaves the app, and that is the doctor's call to make
                    between patients. The browser downloads it over the
                    tailnet and Android's installer takes it from there. */}
                {apkUpdate ? (
                    <Card padded style={styles.update} testID="settings-apk-update">
                        <View style={styles.updateText}>
                            <Text variant="body" weight="semibold">
                                {t('New version ready')}
                            </Text>
                            <Text variant="footnote" tone="muted">
                                {locale === 'ar'
                                    ? `لستر ${apkUpdate.version} (البنية ${apkUpdate.versionCode}). نزّله ثم اضغط تثبيت.`
                                    : `Lustre ${apkUpdate.version} (build ${apkUpdate.versionCode}). Download it, then tap Install.`}
                            </Text>
                        </View>
                        <Button
                            label="Download"
                            size="md"
                            onPress={() => void Linking.openURL(apkUpdate.url)}
                            testID="settings-apk-download"
                        />
                    </Card>
                ) : null}

                {/* Above the summary, like the APK banner: the dump still runs
                    and still verifies when the grant dies, so nothing further
                    down this screen would look wrong. Drawn for the doctor
                    only — it is his Google account, and the CLINIC rows below
                    are gated the same way (§1: the role hides rows, it does
                    not guard anything). */}
                {isDoctor && backups?.tone === 'reauthorize' ? (
                    <Card padded style={styles.backupAlert} testID="settings-backup-alert">
                        <View style={styles.backupIcon}>
                            <DriveAlertIcon />
                        </View>
                        <View style={styles.updateText}>
                            <Text variant="body" weight="semibold">
                                {backups.sub}
                            </Text>
                            <Text variant="footnote" tone="muted">
                                {backups.detail}
                            </Text>
                        </View>
                    </Card>
                ) : null}

                {summary.loading ? <SkeletonRows count={3} /> : null}

                {summary.error ? (
                    <ErrorState
                        message={errorText(summary.error)}
                        onRetry={summary.reload}
                        retrying={summary.reloading}
                    />
                ) : null}

                {summary.data ? (
                    <>
                        <Group title={t('GENERAL')}>
                            <SettingsRow
                                icon={<SettingsIcon glyph="app" />}
                                label="App"
                                sub={t('Language, server connection, version')}
                                onPress={() => routes.push('app')}
                                testID="settings-app-row"
                            />
                            <CardDivider />
                            <SettingsRow
                                icon={<SettingsIcon glyph="appointments" />}
                                label="Appointments"
                                sub={
                                    locale === 'ar'
                                        ? `المدد · الافتراضي ${summary.data.defaultDuration} دقيقة`
                                        : `Durations · default ${summary.data.defaultDuration} min`
                                }
                                onPress={() => routes.push('appointments')}
                                testID="settings-appointments-row"
                            />
                            <CardDivider />
                            <SettingsRow
                                icon={<SettingsIcon glyph="reminders" />}
                                label="Reminders"
                                sub={
                                    locale === 'ar'
                                        ? `قبل الموعد بـ ${summary.data.leadHours} س · التنبيه ${formatClock12(summary.data.notifyAt, locale)}`
                                        : `Due ${summary.data.leadHours}h before · notify ${formatClock12(summary.data.notifyAt, locale)}`
                                }
                                onPress={() => routes.push('reminders')}
                                testID="settings-reminders-row"
                            />
                        </Group>

                        {isDoctor ? (
                            <Group title={t('CLINIC')}>
                                <SettingsRow
                                    icon={<SettingsIcon glyph="clinic" />}
                                    label="Clinic"
                                    sub={t('Name, phone')}
                                    onPress={() => routes.push('clinic')}
                                    testID="settings-clinic-row"
                                />
                                <CardDivider />
                                <SettingsRow
                                    icon={<SettingsIcon glyph="branches" />}
                                    label="Branches"
                                    sub={
                                        locale === 'ar'
                                            ? `${summary.data.activeBranches} نشط · ${summary.data.inactiveBranches} غير نشط`
                                            : `${summary.data.activeBranches} active · ${summary.data.inactiveBranches} inactive`
                                    }
                                    onPress={() => routes.push('branches')}
                                    testID="settings-branches"
                                />
                                <CardDivider />
                                {/* Not in `settings.html`, which never mentions opening hours; kept rather than delete a working screen. */}
                                <SettingsRow
                                    icon={<SettingsIcon glyph="hours" />}
                                    label="Working hours"
                                    sub={
                                        locale === 'ar'
                                            ? `${summary.data.openDays} أيام عمل`
                                            : `${summary.data.openDays} days open`
                                    }
                                    onPress={() => routes.push('hours')}
                                    testID="settings-hours"
                                />
                                <CardDivider />
                                <SettingsRow
                                    icon={<SettingsIcon glyph="backups" />}
                                    label="Backups"
                                    sub={backups?.sub ?? 'Checking…'}
                                    onPress={() => {
                                        if (backups?.canSignIn) setLinkingDrive(true);
                                    }}
                                    testID="settings-backups"
                                />
                                <CardDivider />
                                <SettingsRow
                                    icon={<SettingsIcon glyph="procedures" />}
                                    label="Procedures & prices"
                                    sub={
                                        locale === 'ar'
                                            ? `${summary.data.procedures} إجراء · ${summary.data.activeProcedures} نشط`
                                            : `${summary.data.procedures} procedures · ${summary.data.activeProcedures} active`
                                    }
                                    onPress={() => routes.push('procedures')}
                                    testID="settings-procedures"
                                />
                                <CardDivider />
                                <SettingsRow
                                    icon={<SettingsIcon glyph="fields" />}
                                    label="Patient fields"
                                    sub={
                                        locale === 'ar'
                                            ? `${summary.data.questions} سؤال · ${summary.data.requiredQuestions} مطلوب`
                                            : `${summary.data.questions} questions · ${summary.data.requiredQuestions} required`
                                    }
                                    onPress={() => routes.push('patientFields')}
                                    testID="settings-patient-fields"
                                />
                            </Group>
                        ) : null}

                        {/* Only in demo mode, and only here: a demo is given
                            more than once, and the second run should not open
                            on the first one's cancellations. `resetDemoData`
                            reports the reseed to `api/dataReset`, which is what
                            drops the clinic the query cache and the day view's
                            own hooks are still holding. */}
                        {demo.enabled ? (
                            <Group title={t('DEMO')}>
                                <SettingsRow
                                    icon={<ResetDemoIcon />}
                                    label="Reset demo data"
                                    sub={t('Back to the clinic the demo opens on')}
                                    onPress={() => {
                                        void resetDemoData();
                                    }}
                                    testID="settings-reset-demo"
                                />
                                <CardDivider />
                                {/* The way back from the setup screen's demo
                                    button. Without it a phone that took the
                                    demo by mistake keeps writing into the fake
                                    register until its app data is cleared. */}
                                <SettingsRow
                                    icon={<LeaveDemoIcon />}
                                    label="Leave demo"
                                    sub={t('Connect to the clinic server instead')}
                                    onPress={() => {
                                        void demo.disable();
                                    }}
                                    testID="settings-leave-demo"
                                />
                            </Group>
                        ) : allowsDemo(BUILD_VARIANT) ? (
                            /* The setup screen's demo button, for a dev build
                               that is already connected: setup never shows
                               again once an address is saved, so this is the
                               only way in. The saved address stays put and
                               Leave demo above returns to it. A prod build
                               allows no demo, so its Settings never has this. */
                            <Group title={t('DEMO')}>
                                <SettingsRow
                                    icon={<EnterDemoIcon />}
                                    label="Enter demo"
                                    sub="A fake register, off the clinic server"
                                    onPress={() => {
                                        void demo.enable();
                                    }}
                                    testID="settings-enter-demo"
                                />
                            </Group>
                        ) : null}

                        <Group title={t('ABOUT')}>
                            <SettingsRow
                                icon={<SettingsIcon glyph="about" />}
                                label="About"
                                sub={`${t('Version')} ${INSTALLED.version ?? '0.0.0'}`}
                                onPress={() => {}}
                                testID="settings-about"
                            />
                        </Group>

                        {problem}

                        <Text variant="footnote" tone="muted" script="mono" style={styles.version}>
                            {VERSION_LINE}
                        </Text>
                    </>
                ) : (
                    problem
                )}
            </ScrollView>

            <Toast
                visible={toast !== null}
                message={toast ?? ''}
                onDismiss={() => setToast(null)}
                testID="settings-toast"
            />

            <DriveSignInSheet
                visible={linkingDrive}
                account={backups?.account ?? null}
                busy={link.pending || driveSignIn.linking}
                onConfirm={link.run}
                onCancel={() => setLinkingDrive(false)}
            />

            <RoleSwitchSheet
                visible={switching}
                role={role}
                fromName={ROLE_NAME[role]}
                toName={ROLE_NAME[role === 'doctor' ? 'secretary' : 'doctor']}
                onConfirm={() => {
                    setSwitching(false);
                    roleDone.after(() => {
                        setRole(role === 'doctor' ? 'secretary' : 'doctor');
                        routes.popToRoot();
                    });
                }}
                onCancel={() => setSwitching(false)}
                onClosed={roleDone.closed}
            />

            {/* Nine near-identical blocks before the stack, each repeating its
                own route name three times. A popped pane stays in here until it
                reports the slide finished (`onClosed`), which is the only reason
                a route that is no longer open is still drawn. */}
            {rendered(routes.stack).map(({ id, route: pane }, index) => (
                <PushView
                    key={id}
                    visible={isOpen(routes.stack, index)}
                    onClosed={routes.settled}
                    testID={`settings-pane-${pane}`}
                >
                    {pane === 'app' ? (
                        <AppScreen locale={locale} onChangeLocale={setLocale} onBack={back} />
                    ) : null}
                    {pane === 'appointments' ? <AppointmentsScreen onBack={back} /> : null}
                    {pane === 'reminders' ? <RemindersScreen onBack={back} /> : null}
                    {pane === 'clinic' ? <ClinicScreen onBack={back} /> : null}
                    {pane === 'branches' ? <BranchesScreen onBack={back} /> : null}
                    {pane === 'hours' ? <WorkingHoursScreen onBack={back} /> : null}
                    {pane === 'procedures' ? <ProceduresScreen onBack={back} /> : null}
                    {pane === 'patientFields' ? <PatientFieldsScreen onBack={back} /> : null}
                </PushView>
            ))}
        </View>
    );
}

/** Memoised for the reason the other three clusters are — see `shell/AppShell.tsx`. */
export const SettingsScreen = memo(SettingsScreenView);

function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.group}>
            <SectionLabel inset={false}>{title}</SectionLabel>
            <Card>{children}</Card>
        </View>
    );
}

/**
 * Everything the index's subs are counted from. Four reads go out together over
 * one batched request; the panes below read the same cache, so an edit in a
 * pane is on the index the moment it lands and nothing has to be handed back up
 * on the way out.
 *
 * The identity card names the clinic rather than the branch this phone is
 * standing in: nothing on the server tracks that yet, and a card that says the
 * wrong branch is worse than one that does not claim to know.
 */
/**
 * Polled rather than read once: the grant can die between two taps of the tab,
 * and the whole point of the card is that nothing else on the phone changes
 * when it does. Failure is silent — the connection card already says when the
 * server is not answering, and a second complaint about it is noise.
 */
function useBackups(): BackupView | null {
    const trpc = useTRPC();
    const t = useT();
    const status = useQuery(trpc.backup.status.queryOptions(undefined, { refetchInterval: 5 * 60_000 }));
    return status.data ? backupView(status.data, Date.now(), t) : null;
}

function useSummary() {
    const trpc = useTRPC();

    const settings = useQuery(trpc.settings.get.queryOptions());
    const schedule = useQuery(trpc.settings.schedule.queryOptions());
    const branches = useQuery(trpc.branch.list.queryOptions({ includeInactive: true }));
    const procedures = useQuery(trpc.procedure.tree.queryOptions({ includeInactive: true }));
    const questions = useQuery(trpc.customQuestion.list.queryOptions({ includeInactive: true }));

    const reads = [settings, schedule, branches, procedures, questions];

    const data =
        settings.data && schedule.data && branches.data && procedures.data && questions.data
            ? summarize({
                  settings: settings.data,
                  schedule: schedule.data,
                  branches: branches.data,
                  procedures: procedures.data,
                  questions: questions.data,
              })
            : undefined;

    return {
        data,
        loading: reads.some((read) => read.isLoading),
        reloading: reads.some((read) => read.isFetching),
        error: reads.find((read) => read.error !== null)?.error ?? null,
        reload: () => {
            for (const read of reads) void read.refetch();
        },
    };
}

type SummaryInput = {
    settings: RouterOutput['settings']['get'];
    schedule: RouterOutput['settings']['schedule'];
    branches: RouterOutput['branch']['list'];
    procedures: RouterOutput['procedure']['tree'];
    questions: RouterOutput['customQuestion']['list'];
};

function summarize({ settings, schedule, branches, procedures, questions }: SummaryInput) {
    const flatProcedures = procedures.flatMap((node) => [node, ...node.children]);
    const activeQuestions = questions.filter((q) => q.active);

    return {
        clinicName: settings.clinicName,
        activeBranches: branches.filter((b) => b.active).length,
        inactiveBranches: branches.filter((b) => !b.active).length,
        openDays: schedule.length,
        procedures: flatProcedures.length,
        activeProcedures: flatProcedures.filter((p) => p.active).length,
        questions: activeQuestions.length,
        requiredQuestions: activeQuestions.filter((q) => q.required).length,
        defaultDuration: settings.defaultDuration,
        leadHours: settings.reminderLeadHours,
        notifyAt: minutesFromTime(settings.reminderNotifyAt),
    };
}

// The release this launch runs, the OTA update's number included.
const INSTALLED = installedVersion();
const VERSION_LINE = versionLine(INSTALLED);

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
    scroll: { flex: 1 },
    content: {
        paddingTop: space[4.5],
        paddingHorizontal: size.bleed,
        paddingBottom: space[12],
        gap: space[4.5],
    },
    group: { gap: space[2] },
    version: { textAlign: 'center' },
    backupAlert: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3],
        marginBottom: space[3],
        backgroundColor: color.dueSoft,
    },
    backupIcon: { paddingTop: space[0.5] },
    update: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    updateText: { flex: 1, gap: space[0.5] },
});
