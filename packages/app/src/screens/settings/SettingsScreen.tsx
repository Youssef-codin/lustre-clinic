import type { ClientRole } from '@mawid/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, CardDivider, PushView, ScreenHeader } from '../../components/ui';
import { color, size, space, Text } from '../../theme';
import { BranchesScreen } from './BranchesScreen';
import { SettingsRow } from './components/SettingsRow';
import { PatientFieldsScreen } from './PatientFieldsScreen';
import { ProceduresScreen } from './ProceduresScreen';
import { UsersScreen } from './UsersScreen';
import { WorkingHoursScreen } from './WorkingHoursScreen';

/**
 * Settings — one screen, with rows gated by role (§7.10).
 *
 * Not two screens. The role is a client-side preference and not a permission
 * (SPEC §1, §6): either role can switch to the other in three taps, on the very
 * screen below. Two separate settings screens would imply a boundary that does
 * not exist, and would double every row that both roles need. So there is one
 * screen, and the doctor's rows are simply absent for the secretary — the
 * catalogue and the questionnaire are the doctor's to shape.
 *
 * ## Navigation
 *
 * There is no navigator in `packages/app` yet (F1/F3 in SPEC §18), and §10
 * forbids a screen agent adding one. So this screen is its own stack: one route
 * at a time in a `ui/PushView`, which is the transition the settings designs
 * draw anyway. Lifting these panes into a real navigator is a change of
 * `setRoute` to `navigate` — see BLOCKED.md.
 */

type Route = 'index' | 'procedures' | 'patientFields' | 'branches' | 'hours' | 'users';

export type SettingsScreenProps = {
    /** From the app shell once role selection exists; defaulted until then. */
    role?: ClientRole;
    onChangeRole?: (role: ClientRole) => void;
};

export function SettingsScreen({ role: roleProp, onChangeRole }: SettingsScreenProps) {
    const [route, setRoute] = useState<Route>('index');

    // The shell owns the role once it exists. Until it does, this screen holds
    // it, so the Users row is testable on its own.
    const [localRole, setLocalRole] = useState<ClientRole>('doctor');
    const role = roleProp ?? localRole;

    function changeRole(next: ClientRole) {
        setLocalRole(next);
        onChangeRole?.(next);
    }

    const back = () => setRoute('index');
    const isDoctor = role === 'doctor';

    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.content}>
                <ScreenHeader
                    title="Settings"
                    subtitle={isDoctor ? 'Doctor' : 'Secretary'}
                    trailing={
                        <Text variant="eyebrow" tone="muted">
                            MAWID
                        </Text>
                    }
                />

                <View style={styles.group}>
                    <Card>
                        <SettingsRow
                            icon="◎"
                            label="Branches"
                            sub="Where appointments happen"
                            onPress={() => setRoute('branches')}
                            testID="settings-branches"
                        />
                        <CardDivider />
                        <SettingsRow
                            icon="◷"
                            label="Working hours"
                            sub="When each day opens and closes"
                            onPress={() => setRoute('hours')}
                            testID="settings-hours"
                        />
                    </Card>
                </View>

                {isDoctor ? (
                    <View style={styles.group}>
                        <Card>
                            <SettingsRow
                                icon="⌗"
                                label="Procedures and prices"
                                sub="What a visit can be charged for"
                                onPress={() => setRoute('procedures')}
                                testID="settings-procedures"
                            />
                            <CardDivider />
                            <SettingsRow
                                icon="✎"
                                label="Patient fields"
                                sub="What a new patient is asked"
                                onPress={() => setRoute('patientFields')}
                                testID="settings-patient-fields"
                            />
                        </Card>
                    </View>
                ) : null}

                <View style={styles.group}>
                    <Card>
                        <SettingsRow
                            icon="☺"
                            label="Users"
                            sub="What this phone is set to"
                            value={isDoctor ? 'Doctor' : 'Secretary'}
                            onPress={() => setRoute('users')}
                            testID="settings-users"
                        />
                    </Card>

                    {isDoctor ? null : (
                        <Text variant="footnote" tone="muted" style={styles.note}>
                            Prices and patient questions are set on the doctor's phone. Switch this device to
                            Doctor under Users to reach them.
                        </Text>
                    )}
                </View>
            </ScrollView>

            <PushView visible={route === 'branches'}>
                {route === 'branches' ? <BranchesScreen onBack={back} /> : null}
            </PushView>

            <PushView visible={route === 'hours'}>
                {route === 'hours' ? <WorkingHoursScreen onBack={back} /> : null}
            </PushView>

            <PushView visible={route === 'procedures'}>
                {route === 'procedures' ? <ProceduresScreen onBack={back} /> : null}
            </PushView>

            <PushView visible={route === 'patientFields'}>
                {route === 'patientFields' ? <PatientFieldsScreen onBack={back} /> : null}
            </PushView>

            <PushView visible={route === 'users'}>
                {route === 'users' ? (
                    <UsersScreen role={role} onChangeRole={changeRole} onBack={back} />
                ) : null}
            </PushView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
    content: { paddingBottom: space[12], gap: space[4] },
    group: { gap: space[2], paddingHorizontal: size.gutter },
    note: { paddingHorizontal: space[1] },
});
