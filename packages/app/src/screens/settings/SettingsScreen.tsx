/**
 * Settings — one screen, not two: the role is a client-side preference, not a
 * permission, so the doctor's rows are simply absent for the secretary. Until
 * role selection exists in the app shell, this screen owns the role so the
 * Users row is testable on its own. There is no navigator yet, so this screen
 * is its own stack via `ui/PushView`; lifting the panes into a real navigator
 * is `setRoute` → `navigate`.
 */
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

type Route = 'index' | 'procedures' | 'patientFields' | 'branches' | 'hours' | 'users';

export type SettingsScreenProps = {
    role?: ClientRole;
    onChangeRole?: (role: ClientRole) => void;
};

export function SettingsScreen({ role: roleProp, onChangeRole }: SettingsScreenProps) {
    const [route, setRoute] = useState<Route>('index');

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
