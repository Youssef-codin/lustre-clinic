import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { GalleryScreen } from './src/screens/dev/GalleryScreen';
import { color, useAppFonts } from './src/theme';

// The app has no navigator yet, so the entry point is the component gallery —
// the dev screen that renders every `ui/` primitive in its states. It is what the
// first real screen replaces.
export default function App() {
    const fontsLoaded = useAppFonts();
    if (!fontsLoaded) return <SafeAreaView style={styles.screen} />;

    return (
        <SafeAreaView style={styles.screen}>
            <GalleryScreen />
            <StatusBar style="dark" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
});
