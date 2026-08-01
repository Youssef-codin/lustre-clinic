import type { PublicConfig } from '@mawid/shared';
import { api } from './api.ts';

/**
 * `/api/config` is needed in two places that cannot share React state: the
 * provider that drives the UI, and route loaders, which run outside the tree.
 * Memoizing the promise here means one request either way.
 *
 * Clinic settings do not change while a tab is open — an edit to `config.json`
 * is a server restart — so there is nothing to invalidate.
 */
let inFlight: Promise<PublicConfig> | null = null;

export function loadConfig(): Promise<PublicConfig> {
    if (!inFlight) {
        inFlight = api.get<PublicConfig>('/api/config').catch((err: unknown) => {
            // Do not cache a failure: the desk screen must recover when the
            // server comes back, without a reload.
            inFlight = null;
            throw err;
        });
    }
    return inFlight;
}
