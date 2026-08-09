import { DMMono_400Regular } from '@expo-google-fonts/dm-mono/400Regular';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono/500Medium';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans/500Medium';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans/700Bold';
import { NotoNaskhArabic_400Regular } from '@expo-google-fonts/noto-naskh-arabic/400Regular';
import { NotoNaskhArabic_500Medium } from '@expo-google-fonts/noto-naskh-arabic/500Medium';
import { NotoNaskhArabic_600SemiBold } from '@expo-google-fonts/noto-naskh-arabic/600SemiBold';
import { NotoNaskhArabic_700Bold } from '@expo-google-fonts/noto-naskh-arabic/700Bold';
import { useFonts } from 'expo-font';

// The three bundled faces (Component Inventory §7.2). A system font stack is not
// viable: it resolves to Roboto on Android, and the designs' 620/680 weights and
// negative tracking collapse without anyone noticing.
//
// Instrument Serif is deliberately absent — several designs load it and none use it.
//
// Imported per weight rather than from each package root. The root index re-exports
// every face it ships, and Metro bundles what it can reach: importing it pulls in
// eight italics and DM Mono Light that nothing uses, for about 430KB.
//
// The keys are the family names in tailwind.config.js `fontFamily`. React Native
// selects a face by family name alone, so each weight is registered separately
// rather than as one family with a numeric weight.
export const APP_FONTS = {
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
    NotoNaskhArabic_400Regular,
    NotoNaskhArabic_500Medium,
    NotoNaskhArabic_600SemiBold,
    NotoNaskhArabic_700Bold,
};

/**
 * Loads every bundled face. Returns false until they are all resolved — hold the
 * splash screen until then, or the first frame renders in the fallback face and
 * reflows.
 */
export function useAppFonts(): boolean {
    const [loaded, error] = useFonts(APP_FONTS);
    if (error) throw error;
    return loaded;
}
