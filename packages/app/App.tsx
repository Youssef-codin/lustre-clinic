import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import './global.css';
import { Text, useAppFonts } from './src/theme';

// Token smoke test. This is not a screen and nothing here survives the first real
// one — it exists so the tokens can be seen rendering on a device.
export default function App() {
    const fontsLoaded = useAppFonts();
    if (!fontsLoaded) return <View className="flex-1 bg-canvas" />;

    return (
        <View className="flex-1 items-center justify-center gap-4 bg-canvas px-gutter">
            <Text variant="eyebrow" tone="muted">
                Design tokens
            </Text>
            <Text variant="title">Mawid</Text>
            <Text variant="body" tone="ink2">
                Instrument Sans · DM Mono · Noto Naskh Arabic
            </Text>
            <Text variant="headline">عيادة الأسنان</Text>
            <View className="w-full flex-row items-center justify-between rounded-xl border border-line bg-surface p-4 shadow-card">
                <Text variant="subhead" tone="muted">
                    Outstanding
                </Text>
                <Text variant="amount" tone="danger">
                    EGP 2,600
                </Text>
            </View>
            <View className="h-button w-full items-center justify-center rounded-full bg-accent shadow-fab">
                <Text variant="headline" tone="inverse">
                    Primary
                </Text>
            </View>
            <StatusBar style="dark" />
        </View>
    );
}
