import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ApiProvider } from './src/api';
import { AppShell, SetupScreen, useServerSetup } from './src/shell';
import { color, useAppFonts } from './src/theme';

// The entry point mounts the shell (F3): the bottom tab bar and four clusters,
// each with its own internal navigation. The component gallery lives at
// `src/screens/dev/GalleryScreen` — mount it in place of `<AppShell />` when
// poking at a primitive on a device. `ApiProvider` wraps the whole shell
// because the query cache and connection state outlive any one tab.
//
// Setup (F1) stands in front of it until the phone knows where the clinic
// server is, which on a shipped build is on first launch: `app.json` names no
// address, so there is nothing to probe and the fields open empty. A build
// carrying a default — a dev machine's, a clinic's own — probes it during the
// blank hold instead and goes straight to the shell if it answers. The hold
// covers reading the stored address off the device and that probe as well as
// the fonts, because mounting either screen before the answer is in flashes
// the wrong one.
export default function App() {
    const fontsLoaded = useAppFonts();
    const { ready, showSetup } = useServerSetup();
    if (!fontsLoaded || !ready) return <View style={styles.screen} />;

    return (
        <SafeAreaProvider>
            <ApiProvider>
                <SafeAreaView style={styles.screen} edges={['top']}>
                    {showSetup ? <SetupScreen /> : <AppShell />}
                    <StatusBar style="dark" />
                </SafeAreaView>
            </ApiProvider>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
});
