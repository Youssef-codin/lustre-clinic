/**
 * The last thing between a throw during render and a white screen. React
 * unmounts the whole tree when a render throws and there is no boundary above
 * it: in a dev build that is the red screen, in a release build it is nothing
 * at all, with no route back short of force-stopping the app. That lands on a
 * secretary mid-check-in with a patient standing there.
 *
 * Not `ErrorState`, which is a different job entirely — that draws a *query*
 * that failed, a rejected fetch the caller already knows about, and catches
 * nothing. This catches what nobody saw coming.
 *
 * What it does not catch, because React boundaries do not: anything thrown from
 * an event handler, a timer, or a promise. Those are the query layer's, and a
 * rejected mutation still surfaces through `ErrorState` where it always did.
 *
 * A class, which is the one place in this codebase that is the right answer —
 * `getDerivedStateFromError` has no hook form.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { color, radius, space, Text } from '../../theme';
import { Button } from './Button';

export type ErrorBoundaryProps = {
    children: ReactNode;
    /** The headline, in the app's voice. The caller knows what it wrapped. */
    title: string;
    message: string;
    actionLabel?: string;
    /**
     * Clears a boundary that has already tripped. Any value that changes when
     * the user navigates will do — a tripped boundary that stays tripped after
     * they have gone somewhere else is a dead tab.
     */
    resetKey?: unknown;
    /**
     * Somewhere to report from. Nothing passes this yet: §17 names GlitchTip
     * and `api/errors` already marks which failures are reportable, but the app
     * reports nowhere, and adding that is its own ticket — it brings a
     * dependency and a network path with it. The allow-list rule will apply
     * when it lands: IDs and codes, never patient data.
     */
    onError?: (error: Error, info: ErrorInfo) => void;
};

type ErrorBoundaryState = {
    failed: boolean;
    /** The key the current `failed` was decided against, to notice a change. */
    resetKey: unknown;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    override state: ErrorBoundaryState = { failed: false, resetKey: this.props.resetKey };

    static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
        return { failed: true };
    }

    static getDerivedStateFromProps(
        props: ErrorBoundaryProps,
        state: ErrorBoundaryState,
    ): Partial<ErrorBoundaryState> | null {
        if (props.resetKey === state.resetKey) return null;
        return { failed: false, resetKey: props.resetKey };
    }

    override componentDidCatch(error: Error, info: ErrorInfo) {
        this.props.onError?.(error, info);
    }

    // Nothing is preserved across this. The children were unmounted when the
    // boundary tripped, so their state went with them and a retry remounts them
    // from scratch — which for a cluster means it comes back at its own root
    // rather than on the route that threw. That is the recovery, not a loss.
    private retry = () => this.setState({ failed: false });

    override render() {
        if (!this.state.failed) return this.props.children;

        return (
            <View style={styles.root}>
                <View style={styles.card}>
                    <View style={styles.glyph}>
                        <Text variant="title2" tone="muted">
                            {'!'}
                        </Text>
                    </View>

                    <Text variant="title3">{this.props.title}</Text>
                    <Text variant="subhead" tone="muted" style={styles.body}>
                        {this.props.message}
                    </Text>

                    <Button
                        label={this.props.actionLabel ?? 'Reload'}
                        onPress={this.retry}
                        variant="primary"
                        size="lg"
                        block
                        style={styles.action}
                    />
                </View>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: color.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space[5],
    },
    card: {
        alignSelf: 'stretch',
        alignItems: 'center',
        gap: space[2],
        paddingVertical: space[8],
        paddingHorizontal: space[5],
        borderRadius: radius.xl2,
        backgroundColor: color.surface,
    },
    glyph: {
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: space[1],
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: color.line,
    },
    body: { textAlign: 'center' },
    action: { marginTop: space[4] },
});
