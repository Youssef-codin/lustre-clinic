/**
 * `server/src/modules/backup`. A demo is the phone talking to itself, so there
 * is no backup job and nothing to be stale about: it answers as a clinic whose
 * last night went fine, which is what the Settings row should look like when
 * nobody is being shown a problem.
 *
 * Local mode's clinic is real, so it is told the truth instead: nothing has
 * been backed up, because nothing runs one.
 *
 * Signing in is refused rather than faked. There is no clinic server to hold a
 * refresh token, and a demo that appeared to link a real Google account would
 * be lying about where the dumps go.
 */
import { ERROR_CODE } from '@lustre/shared';
import type { RouterOutput } from '../../types';
import { openKind } from '../db';
import { DemoError } from '../rules';
import type { Dated } from '../wire';

export const backupHandlers = {
    status(): Dated<RouterOutput['backup']['status']> {
        if (openKind() === 'local') {
            return {
                lastSuccessAt: null,
                stale: true,
                staleAfterHours: 48,
                offsite: {
                    configured: false,
                    reauthorizationRequiredSince: null,
                    account: null,
                    canSignIn: false,
                },
            };
        }
        return {
            lastSuccessAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
            stale: false,
            staleAfterHours: 48,
            offsite: {
                configured: true,
                reauthorizationRequiredSince: null,
                account: 'demo@example.com',
                canSignIn: false,
            },
        };
    },

    signInConfig(): Dated<RouterOutput['backup']['signInConfig']> {
        throw new DemoError(ERROR_CODE.DRIVE_SIGN_IN_UNCONFIGURED, 'the demo has no clinic server');
    },

    linkDrive(): Dated<RouterOutput['backup']['linkDrive']> {
        throw new DemoError(ERROR_CODE.DRIVE_SIGN_IN_UNCONFIGURED, 'the demo has no clinic server');
    },
};
