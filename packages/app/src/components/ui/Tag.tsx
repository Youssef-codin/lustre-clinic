import { StyleSheet, View } from 'react-native';
import type { TextTone } from '../../theme';
import { color, radius, space, Text } from '../../theme';

export type TagTone = 'muted' | 'ink' | 'accent' | 'success' | 'due' | 'danger';
export type TagVariant = 'outline' | 'filled' | 'muted';

export type TagProps = {
    children: string;
    tone?: TagTone;
    variant?: TagVariant;
};

const BORDER: Record<TagTone, string> = {
    muted: color.line,
    ink: color.ink,
    accent: color.accent,
    success: color.success,
    due: color.due,
    danger: color.danger,
};

const FILL: Record<TagTone, string> = {
    muted: color.surface2,
    ink: color.surface2,
    accent: color.accentSoft,
    success: color.successSoft,
    due: color.dueSoft,
    danger: color.dangerSoft,
};

const TEXT: Record<TagTone, TextTone> = {
    muted: 'muted',
    ink: 'ink',
    accent: 'accent',
    success: 'success',
    due: 'due',
    danger: 'danger',
};

export function Tag({ children, tone = 'muted', variant = 'outline' }: TagProps) {
    return (
        <View
            style={[
                styles.tag,
                variant !== 'filled' && { borderWidth: 1, borderColor: BORDER[tone] },
                variant === 'filled' && { backgroundColor: FILL[tone] },
                variant === 'muted' && styles.dim,
            ]}
        >
            <Text variant="tag" tone={TEXT[tone]}>
                {children}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    tag: {
        alignSelf: 'flex-start',
        paddingHorizontal: space[1.5],
        paddingVertical: space[0.5],
        borderRadius: radius.sm,
    },
    dim: { opacity: 0.6 },
});
