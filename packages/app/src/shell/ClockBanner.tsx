import { useQuery } from '@tanstack/react-query';
import * as Updates from 'expo-updates';
// biome-ignore lint/style/noRestrictedImports: the `AppState` subscription that re-checks when the phone comes back from its settings
import { useEffect } from 'react';
import { AppState, DevSettings, Linking } from 'react-native';
import { noteServerClock, trpcClient } from '../api';
import { formatDuration } from '../components/domain/clock';
import { Banner, Button } from '../components/ui';
import { useT } from '../i18n';
import { type ClockProblem, clockProblem, clockSkew } from './clockCheck';

const RECHECK_MS = 5 * 60_000;

/** Set when the button sends the phone to its date and time settings. */
let sentToSettings = false;

/**
 * The JS engine reads the phone's zone once, when it starts, so a zone fixed in
 * Android's settings changes nothing here — not the check, and not a single
 * booked time on screen — until the app is started again. Nobody at the desk
 * would guess that, so coming back from the settings this banner opened starts
 * it again for them. If nothing was fixed, the banner is simply back.
 */
function restartForNewZone(): void {
    if (__DEV__) {
        DevSettings.reload();
        return;
    }
    void Updates.reloadAsync().catch(() => {});
}

/**
 * The strip over the day that says this phone's time cannot be trusted
 * (`clockCheck.ts`). Not dismissable: until it is fixed every booking made
 * here can land an hour out, and the chair's timer is wrong for everyone who
 * looks at it. The button goes straight to Android's date and time settings,
 * and coming back from them restarts the app, so turning on automatic time
 * clears it.
 */
export function ClockBanner() {
    const t = useT();
    const problem = useClockProblem();

    if (!problem) return null;

    const message =
        problem.kind === 'zone'
            ? t("This phone's time zone doesn't match the clinic's. Turn on automatic date and time.")
            : t("This phone's clock is off by {duration}. Turn on automatic date and time.", {
                  duration: formatDuration(problem.offByMinutes),
              });

    return (
        <Banner
            tone="warning"
            message={message}
            action={
                <Button
                    label="Open settings"
                    variant="text"
                    size="md"
                    onPress={() => {
                        sentToSettings = true;
                        void Linking.sendIntent('android.settings.DATE_SETTINGS').catch(() => {
                            sentToSettings = false;
                        });
                    }}
                    testID="home-clock-settings"
                />
            }
        />
    );
}

function useClockProblem(): ClockProblem | null {
    const check = useQuery({
        queryKey: ['clock-check'],
        queryFn: async () => {
            const sentAt = Date.now();
            const server = await trpcClient.health.clock.query();
            const receivedAt = Date.now();
            // Kept even when it is within tolerance: the notices age `/ws`
            // frames by it, and a wound-forward clock is exactly when they need it.
            const skew = clockSkew(server.now, sentAt, receivedAt);
            if (skew !== null) noteServerClock(skew);
            return clockProblem(server, sentAt, receivedAt, -new Date().getTimezoneOffset());
        },
        refetchInterval: RECHECK_MS,
    });

    const { refetch } = check;
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            if (sentToSettings) {
                sentToSettings = false;
                restartForNewZone();
                return;
            }
            void refetch();
        });
        return () => subscription.remove();
    }, [refetch]);

    return check.data ?? null;
}
