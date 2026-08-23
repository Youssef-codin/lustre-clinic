/**
 * Settings — one screen, not two: the role is a client-side preference, not a
 * permission, so the doctor's rows are simply absent for the secretary. There
 * is no navigator yet, so this screen is its own stack via `ui/PushView`;
 * lifting the panes into a real navigator is `setRoute` → `navigate`.
 *
 * The index is a summary, not a menu. `settings.html` fills every row's sub
 * with that row's current answer — "default 30 min", "2 active · 1 inactive" —
 * so most questions are answered without opening anything, which is why the
 * screen loads all six summaries up front and shows skeleton rows rather than
 * drawing labels with empty subs under them.
 */
import type { ClientRole } from '@lustre/shared';
import Constants from 'expo-constants';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BrandMark } from '../../components/domain';
import { Card, CardDivider, PushView, ScreenHeader, SectionLabel } from '../../components/ui';
// The store module directly, not the `shell` barrel: that barrel exports
// `AppShell`, which imports this screen.
import { setLocale, useLocale } from '../../shell/localeStore';
import { color, size, space, Text } from '../../theme';
import { AppointmentsScreen } from './AppointmentsScreen';
import { AppScreen } from './AppScreen';
import { BranchesScreen } from './BranchesScreen';
import { ClinicScreen } from './ClinicScreen';
import { formatClock12 } from './components/_LocalClock';
import { IdentityCard } from './components/IdentityCard';
import { DataEntryIcon, SettingsIcon } from './components/icons';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { RoleSwitchSheet } from './components/RoleSwitchSheet';
import { SettingsRow } from './components/SettingsRow';
import { api } from './data/_LocalApi';
import { useConnectionView } from './data/connection';
import { errorMessage, useQuery } from './data/hooks';
import { DataEntryScreen } from './dataEntry';
import { PatientFieldsScreen } from './PatientFieldsScreen';
import { ProceduresScreen } from './ProceduresScreen';
import { RemindersScreen } from './RemindersScreen';
import { WorkingHoursScreen } from './WorkingHoursScreen';

type Route =
    | 'index'
    | 'app'
    | 'appointments'
    | 'reminders'
    | 'clinic'
    | 'branches'
    | 'hours'
    | 'procedures'
    | 'patientFields'
    | 'dataEntry';

const ROLE_NAME: Record<ClientRole, string> = { doctor: 'Doctor', secretary: 'Secretary' };
const ROLE_INITIAL: Record<ClientRole, string> = { doctor: 'D', secretary: 'S' };

export type SettingsScreenProps = {
    role?: ClientRole;
    onChangeRole?: (role: ClientRole) => void;
};

export function SettingsScreen({ role: roleProp, onChangeRole }: SettingsScreenProps) {
    const [route, setRoute] = useState<Route>('index');
    const [switching, setSwitching] = useState(false);

    const [localRole, setLocalRole] = useState<ClientRole>('doctor');
    const role = roleProp ?? localRole;

    const locale = useLocale();

    const summary = useQuery(loadSummary);
    const connection = useConnectionView();

    const back = () => setRoute('index');
    const isDoctor = role === 'doctor';

    function changeRole(next: ClientRole) {
        setLocalRole(next);
        onChangeRole?.(next);
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader title="Settings" trailing={<BrandMark variant="lockup" size={13} tone="muted" />} />

            <IdentityCard
                roleName={ROLE_NAME[role]}
                roleInitial={ROLE_INITIAL[role]}
                branchName={summary.data?.branchName ?? 'No branch yet'}
                connection={connection}
                onSwitchRole={() => setSwitching(true)}
                testID="settings-identity"
            />

            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                {summary.loading ? <SkeletonRows count={3} /> : null}

                {summary.error ? (
                    <ErrorState
                        message={errorMessage(summary.error) ?? ''}
                        onRetry={summary.reload}
                        retrying={summary.reloading}
                    />
                ) : null}

                {summary.data ? (
                    <>
                        <Group title="GENERAL">
                            <SettingsRow
                                icon={<SettingsIcon glyph="app" />}
                                label="App"
                                sub="Language, server connection"
                                onPress={() => setRoute('app')}
                                testID="settings-app-row"
                            />
                            <CardDivider />
                            <SettingsRow
                                icon={<SettingsIcon glyph="appointments" />}
                                label="Appointments"
                                sub={`Durations · default ${summary.data.defaultDuration} min`}
                                onPress={() => setRoute('appointments')}
                                testID="settings-appointments-row"
                            />
                            <CardDivider />
                            <SettingsRow
                                icon={<SettingsIcon glyph="reminders" />}
                                label="Reminders"
                                sub={`Due ${summary.data.leadHours}h before · notify ${formatClock12(summary.data.notifyAt)}`}
                                onPress={() => setRoute('reminders')}
                                testID="settings-reminders-row"
                            />
                        </Group>

                        {isDoctor ? (
                            <Group title="CLINIC">
                                <SettingsRow
                                    icon={<SettingsIcon glyph="clinic" />}
                                    label="Clinic"
                                    sub="Name, phone"
                                    onPress={() => setRoute('clinic')}
                                    testID="settings-clinic-row"
                                />
                                <CardDivider />
                                <SettingsRow
                                    icon={<SettingsIcon glyph="branches" />}
                                    label="Branches"
                                    sub={`${summary.data.activeBranches} active · ${summary.data.inactiveBranches} inactive`}
                                    onPress={() => setRoute('branches')}
                                    testID="settings-branches"
                                />
                                <CardDivider />
                                {/* Not in `settings.html` — see BLOCKED.md. */}
                                <SettingsRow
                                    icon={<SettingsIcon glyph="hours" />}
                                    label="Working hours"
                                    sub={`${summary.data.openDays} days open`}
                                    onPress={() => setRoute('hours')}
                                    testID="settings-hours"
                                />
                                <CardDivider />
                                <SettingsRow
                                    icon={<SettingsIcon glyph="procedures" />}
                                    label="Procedures & prices"
                                    sub={`${summary.data.procedures} procedures · ${summary.data.activeProcedures} active`}
                                    onPress={() => setRoute('procedures')}
                                    testID="settings-procedures"
                                />
                                <CardDivider />
                                <SettingsRow
                                    icon={<SettingsIcon glyph="fields" />}
                                    label="Patient fields"
                                    sub={`${summary.data.questions} questions · ${summary.data.requiredQuestions} required`}
                                    onPress={() => setRoute('patientFields')}
                                    testID="settings-patient-fields"
                                />
                            </Group>
                        ) : null}

                        {/* The secretary's, and only hers: she is the one
                            retyping the old system's register, and the doctor
                            tapping into a bulk entry form is a mis-tap with a
                            patient at the end of it. Like every other row here
                            the gate is the device-local role, which hides rows
                            and never guards access (§1). */}
                        {isDoctor ? null : (
                            <Group title="MIGRATION">
                                <SettingsRow
                                    icon={<DataEntryIcon />}
                                    label="Data entry"
                                    sub="Bulk entry from the old system"
                                    onPress={() => setRoute('dataEntry')}
                                    testID="settings-data-entry-row"
                                />
                            </Group>
                        )}

                        <Group title="ABOUT">
                            <SettingsRow
                                icon={<SettingsIcon glyph="about" />}
                                label="About"
                                sub={`Version ${VERSION}`}
                                onPress={() => {}}
                                testID="settings-about"
                            />
                        </Group>

                        <Text variant="footnote" tone="muted" script="mono" style={styles.version}>
                            {VERSION_LINE}
                        </Text>
                    </>
                ) : null}
            </ScrollView>

            <RoleSwitchSheet
                visible={switching}
                role={role}
                fromName={ROLE_NAME[role]}
                toName={ROLE_NAME[role === 'doctor' ? 'secretary' : 'doctor']}
                onConfirm={() => {
                    changeRole(role === 'doctor' ? 'secretary' : 'doctor');
                    setSwitching(false);
                    setRoute('index');
                }}
                onCancel={() => setSwitching(false)}
            />

            <PushView visible={route === 'app'}>
                {route === 'app' ? (
                    <AppScreen locale={locale} onChangeLocale={setLocale} onBack={back} />
                ) : null}
            </PushView>

            <PushView visible={route === 'appointments'}>
                {route === 'appointments' ? (
                    <AppointmentsScreen
                        onBack={() => {
                            back();
                            summary.reload();
                        }}
                    />
                ) : null}
            </PushView>

            <PushView visible={route === 'reminders'}>
                {route === 'reminders' ? (
                    <RemindersScreen
                        onBack={() => {
                            back();
                            summary.reload();
                        }}
                    />
                ) : null}
            </PushView>

            <PushView visible={route === 'clinic'}>
                {route === 'clinic' ? <ClinicScreen onBack={back} /> : null}
            </PushView>

            <PushView visible={route === 'branches'}>
                {route === 'branches' ? (
                    <BranchesScreen
                        onBack={() => {
                            back();
                            summary.reload();
                        }}
                    />
                ) : null}
            </PushView>

            <PushView visible={route === 'hours'}>
                {route === 'hours' ? (
                    <WorkingHoursScreen
                        onBack={() => {
                            back();
                            summary.reload();
                        }}
                    />
                ) : null}
            </PushView>

            <PushView visible={route === 'procedures'}>
                {route === 'procedures' ? (
                    <ProceduresScreen
                        onBack={() => {
                            back();
                            summary.reload();
                        }}
                    />
                ) : null}
            </PushView>

            <PushView visible={route === 'patientFields'}>
                {route === 'patientFields' ? (
                    <PatientFieldsScreen
                        onBack={() => {
                            back();
                            summary.reload();
                        }}
                    />
                ) : null}
            </PushView>

            {/* No `summary.reload()` on the way out: this pane writes patients,
                which is not one of the things the index counts. */}
            <PushView visible={route === 'dataEntry'}>
                {route === 'dataEntry' ? <DataEntryScreen onBack={back} /> : null}
            </PushView>
        </View>
    );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.group}>
            <SectionLabel inset={false}>{title}</SectionLabel>
            <Card>{children}</Card>
        </View>
    );
}

/**
 * Everything the index's subs are counted from, in one round trip. The panes
 * below each load their own data again — these are summaries, and a pane that
 * trusted a count passed down to it would show a stale one after an edit.
 */
async function loadSummary() {
    const [branches, currentBranchId, procedures, questions, appointments, reminders, schedule] =
        await Promise.all([
            api.branch.list({ includeInactive: true }),
            api.branch.current(),
            api.procedure.tree({ includeInactive: true }),
            api.customQuestion.list({ includeInactive: true }),
            api.appointmentSettings.get(),
            api.reminderSettings.get(),
            api.settings.schedule(),
        ]);

    const flatProcedures = procedures.flatMap((node) => [node, ...node.children]);
    const activeQuestions = questions.filter((q) => q.active);

    return {
        branchName: branches.find((b) => b.id === currentBranchId)?.name ?? 'No branch yet',
        activeBranches: branches.filter((b) => b.active).length,
        inactiveBranches: branches.filter((b) => !b.active).length,
        openDays: schedule.length,
        procedures: flatProcedures.length,
        activeProcedures: flatProcedures.filter((p) => p.active).length,
        questions: activeQuestions.length,
        requiredQuestions: activeQuestions.filter((q) => q.required).length,
        defaultDuration: appointments.defaultDuration,
        leadHours: reminders.leadHours,
        notifyAt: reminders.notifyAt,
    };
}

const VERSION = Constants.expoConfig?.version ?? '0.0.0';
const BUILD = Constants.nativeBuildVersion;
const VERSION_LINE = BUILD ? `Lustre ${VERSION} (build ${BUILD})` : `Lustre ${VERSION}`;

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
});
