/**
 * The daily nudge as a real alarm (`android/`): it loops until someone stops
 * it, fills the lock screen, and is armed with `setAlarmClock`, so Doze never
 * holds it back and a reboot does not lose it. `expo-notifications` can do none
 * of that — a notification's sound plays once and stops.
 *
 * Optional, because the JS can run where it is not built in (iOS, a dev
 * client from before it): `alarmsAvailable` is false there and the nudge stays
 * an ordinary notification.
 */
import { requireOptionalNativeModule } from 'expo';

export interface AlarmCopy {
    title: string;
    body: string;
    snooze: string;
    open: string;
    /** What Android settings lists the ringing notification's channel as. */
    channelName: string;
}

/**
 * Asked of the clinic server just before each ring (`src/notifications/alarmCheck.ts`
 * writes it). Null rings without asking.
 */
export interface AlarmCheck {
    /** Tried in order, the one the app is on first. */
    bases: string[];
    pendingPath: string;
    settingsPath: string;
    today: string;
}

interface LustreAlarmNative {
    schedule(at: number[], copy: AlarmCopy, check: AlarmCheck | null, rings: boolean): boolean;
    tryIn(ms: number, copy: AlarmCopy): boolean;
    cancel(): void;
    takeOpenRequest(): boolean;
    canFullScreen(): boolean;
    openFullScreenSettings(): void;
}

const native = requireOptionalNativeModule<LustreAlarmNative>('LustreAlarm');

export const alarmsAvailable = native !== null;

/**
 * Replaces whatever was armed. `rings` picks a ringing alarm or a plain
 * notification; either way each one asks `check` first. False when Android
 * refused an exact alarm, or there is no native side.
 */
export function scheduleAlarms(
    at: Date[],
    copy: AlarmCopy,
    check: AlarmCheck | null,
    rings: boolean,
): boolean {
    return (
        native?.schedule(
            at.map((date) => date.getTime()),
            copy,
            check,
            rings,
        ) ?? false
    );
}

/** One ring `ms` from now, beside the armed series and leaving it be. For demo mode. */
export function tryAlarm(ms: number, copy: AlarmCopy): boolean {
    return native?.tryIn(ms, copy) ?? false;
}

/** Disarms the series and stops a ring that is going. */
export function cancelAlarms(): void {
    native?.cancel();
}

/** Whether Open reminders was tapped since the last ask. Asking clears it. */
export function takeOpenRequest(): boolean {
    return native?.takeOpenRequest() ?? false;
}

/** Whether a ring may take over the lock screen. Android 14 lets the user switch that off. */
export function canTakeOverLockScreen(): boolean {
    return native?.canFullScreen() ?? false;
}

export function openLockScreenSettings(): void {
    native?.openFullScreenSettings();
}
