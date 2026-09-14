/**
 * `server/src/modules/release`. A demo is the phone talking to itself: there is
 * no clinic server with a newer APK on it, so there never is one.
 */
import type { RouterOutput } from '../../types';
import type { Dated } from '../wire';

export const releaseHandlers = {
    latestApk(): Dated<RouterOutput['release']['latestApk']> {
        return null;
    },
};
