import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { DayScreen } from './src/screens/day';
import { color, useAppFonts } from './src/theme';

// There is no navigator yet (F3), so the entry point is the one screen that is
// built: the day view. The component gallery it replaced is still there, at
// `src/screens/dev/GalleryScreen`, and is what to mount when a primitive needs
// poking at on a device.
export default function App() {
    const fontsLoaded = useAppFonts();
    if (!fontsLoaded) return <SafeAreaView style={styles.screen} />;

    return (
        <SafeAreaView style={styles.screen}>
            <DayScreen />
            <StatusBar style="dark" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
});
