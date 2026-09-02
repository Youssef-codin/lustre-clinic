/**
 * A list that could not load, and the way back. This is not an edge case in
 * this app: the clinic server is a PC reached over Tailscale that is switched
 * off during a power cut, so "could not load, try again" is a normal state on
 * every screen and every one of them offers Retry.
 *
 * `message` arrives already localized from `ERROR_CODE` — nothing here reads
 * server message text. `retrying` drives the button's own spinner rather than
 * replacing the state with a skeleton, so the sentence the desk just read stays
 * on screen while the second attempt is in flight.
 */
import { StyleSheet } from 'react-native';
import { space, Text } from '../../theme';
import { Button } from './Button';
import { Card } from './Card';

export type ErrorStateProps = {
    message: string;
    onRetry: () => void;
    retrying?: boolean;
};

export function ErrorState({ message, onRetry, retrying = false }: ErrorStateProps) {
    return (
        <Card variant="dashed" padded style={styles.state}>
            <Text variant="headline">Couldn't load this</Text>
            <Text variant="subhead" tone="muted" style={styles.message}>
                {message}
            </Text>
            <Button
                label="Try again"
                variant="secondary"
                onPress={onRetry}
                loading={retrying}
                style={styles.action}
            />
        </Card>
    );
}

const styles = StyleSheet.create({
    state: { alignItems: 'center', gap: space[2] },
    message: { textAlign: 'center' },
    action: { alignSelf: 'center' },
});
