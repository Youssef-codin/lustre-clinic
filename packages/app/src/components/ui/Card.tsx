import type { ViewProps } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { color, radius, shadow, space } from '../../theme';

export type CardProps = ViewProps & {
    /** `dashed` marks read-only or built-in content the clinic cannot edit. */
    variant?: 'solid' | 'dashed';
    /** Off by default: a card of hairline-divided rows pads its rows, not itself. */
    padded?: boolean;
    elevated?: boolean;
};

export function Card({ variant = 'solid', padded = false, elevated = false, style, ...rest }: CardProps) {
    return (
        <View
            style={[
                styles.card,
                variant === 'dashed' && styles.dashed,
                padded && styles.padded,
                elevated && styles.elevated,
                style,
            ]}
            {...rest}
        />
    );
}

/**
 * A hairline between rows inside a Card. The designs draw it as a border on the
 * row rather than a separate element; this is the same thing, addressable.
 */
export function CardDivider() {
    return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
    card: {
        borderRadius: radius.xl2,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
        // Rows can then hairline-divide to the card's own edge.
        overflow: 'hidden',
    },
    dashed: { borderStyle: 'dashed', backgroundColor: color.canvas },
    padded: { padding: space[4] },
    elevated: { boxShadow: shadow.card },
    divider: { height: 1, backgroundColor: color.hair },
});
