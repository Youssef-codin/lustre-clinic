/**
 * `server/src/modules/backup`. A demo is the phone talking to itself, so there
 * is no backup job and nothing to be stale about: it answers as a clinic whose
 * last night went fine, which is what the Settings row should look like when
 * nobody is being shown a problem.
 */
import type { RouterOutput } from '../../types';
import type { Dated } from '../wire';

export const backupHandlers = {
    status(): Dated<RouterOutput['backup']['status']> {
        return {
            lastSuccessAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
            stale: false,
            staleAfterHours: 48,
            offsite: { configured: true, reauthorizationRequiredSince: null },
        };
    },
};
