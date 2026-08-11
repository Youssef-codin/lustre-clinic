/**
 * The placeholder, drawn by us rather than by `TextInput`. Android renders the
 * native hint in the system typeface no matter what `fontFamily` the input
 * carries, so on a Samsung it came out in One UI's face next to a label in
 * Instrument Sans. Drawing it also buys per-string script detection: an Arabic
 * placeholder gets Noto Naskh, which the native hint could not do. The overlay
 * sits above the input, so `pointerEvents="none"` — a tap has to reach the field
 * under it.
 */
import { StyleSheet, View } from 'react-native';
import type { TextVariant } from '../../theme';
import { Text } from '../../theme';

export type PlaceholderProps = {
    text?: string;
    visible: boolean;
    variant?: TextVariant;
    align?: 'start' | 'end' | 'top';
};

export function Placeholder({ text, visible, variant = 'body', align = 'start' }: PlaceholderProps) {
    if (!visible || !text) return null;

    return (
        <View
            pointerEvents="none"
            style={[styles.overlay, align === 'end' && styles.end, align === 'top' && styles.top]}
        >
            <Text variant={variant} tone="muted" numberOfLines={1}>
                {text}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        justifyContent: 'center',
    },
    end: { alignItems: 'flex-end' },
    top: { justifyContent: 'flex-start' },
});
