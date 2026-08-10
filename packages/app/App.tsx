import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { ApiProvider } from './src/api';
import { AppShell } from './src/shell';
import { color, useAppFonts } from './src/theme';

// The entry point is the shell (F3): the bottom tab bar and the four clusters
// under it. Each cluster still owns its internal navigation. The component
// gallery is still there, at `src/screens/dev/GalleryScreen`, and is what to
// mount in place of `<AppShell />` when a primitive needs poking at on a device.
//
// `ApiProvider` wraps the whole shell rather than a screen, because the query
// cache and the connection state outlive any one tab. The day view still talks
// to the server through its own `data/` client (BLOCKED.md) and does not use it
// yet.
export default function App() {
    const fontsLoaded = useAppFonts();
    if (!fontsLoaded) return <SafeAreaView style={styles.screen} />;

    return (
        <ApiProvider>
            <SafeAreaView style={styles.screen}>
                <AppShell />
                <StatusBar style="dark" />
            </SafeAreaView>
        </ApiProvider>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
});
