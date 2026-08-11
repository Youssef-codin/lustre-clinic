import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ApiProvider } from './src/api';
import { AppShell } from './src/shell';
import { color, useAppFonts } from './src/theme';

// The entry point mounts the shell (F3): the bottom tab bar and four clusters,
// each with its own internal navigation. The component gallery lives at
// `src/screens/dev/GalleryScreen` — mount it in place of `<AppShell />` when
// poking at a primitive on a device. `ApiProvider` wraps the whole shell
// because the query cache and connection state outlive any one tab.
export default function App() {
    const fontsLoaded = useAppFonts();
    if (!fontsLoaded) return <View style={styles.screen} />;

    return (
        <SafeAreaProvider>
            <ApiProvider>
                <SafeAreaView style={styles.screen} edges={['top']}>
                    <AppShell />
                    <StatusBar style="dark" />
                </SafeAreaView>
            </ApiProvider>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
});
