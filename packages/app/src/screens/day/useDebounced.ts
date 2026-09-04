/**
 * A value that lags behind, so a query keyed on it fires on a pause rather
 * than on a keystroke. The clinic server is a hop away over Tailscale and this
 * app is deliberately chatty nowhere else — the calendar fetches a month in one
 * request for the same reason. A search that fires per character also races
 * itself, and the answer for `nad` can land after the answer for `nadi`.
 */
// biome-ignore lint/style/noRestrictedImports: the lag is a `setTimeout` restarted on every change, and the cleanup cancelling the last one is what makes it a debounce rather than a queue
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delayMs: number): T {
    const [settled, setSettled] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return settled;
}
