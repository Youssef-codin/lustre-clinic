import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { ApiProvider } from './src/api';
import { DayScreen } from './src/screens/day';
import { color, useAppFonts } from './src/theme';

// There is no navigator yet (F3), so the entry point is the one screen that is
// built: the day view. The component gallery it replaced is still there, at
// `src/screens/dev/GalleryScreen`, and is what to mount when a primitive needs
// poking at on a device.
//
// `ApiProvider` wraps the whole shell rather than the screen, because the query
// cache and the connection state outlive any one of them. The day view still
// talks to the server through its own `data/` client (BLOCKED.md) and does not
// use it yet.
export default function App() {
    const fontsLoaded = useAppFonts();
    if (!fontsLoaded) return <SafeAreaView style={styles.screen} />;

    return (
        <ApiProvider>
            <SafeAreaView style={styles.screen}>
                <DayScreen />
                <StatusBar style="dark" />
            </SafeAreaView>
        </ApiProvider>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
});
