/**
 * The crash reporter: `@sentry/react-native` pointed at the clinic's GlitchTip
 * (SPEC §17). `options.ts` decides whether it runs and `privacy.ts` decides what
 * leaves the phone. This file connects the two to the SDK.
 *
 * Offline is the SDK's problem: it keeps envelopes on disk and sends them when
 * the tailnet is back. Nothing here waits on the network.
 */
import type { ClientRole } from '@lustre/shared';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import type { ErrorInfo } from 'react';
import { AppState } from 'react-native';
import { BUILD_VARIANT } from '../api/config';
import { isDemoMode } from '../api/demo';
import { dsnOf, sdkOptions } from './options';
import { allowBreadcrumb, allowEvent, type Boundary, PROBLEM_REPORT } from './privacy';
import { lifecycleCrumb, setTrailSink } from './trail';

const options = sdkOptions(dsnOf(Constants.expoConfig?.extra), BUILD_VARIANT);

/** Whether this build reports at all. A dev build set to demo mode is still checked per event. */
export const CRASH_REPORTS_ON = options.enabled;

let started = false;

export function startCrashReports(): void {
    if (!CRASH_REPORTS_ON || started) return;
    started = true;

    Sentry.init({
        ...options,
        // The stock breadcrumbs integration records console calls and every XHR
        // with its full URL. Both are replaced by the crumbs in `trail.ts`.
        integrations: (defaults) => [
            ...defaults.filter((integration) => integration.name !== 'Breadcrumbs'),
            Sentry.breadcrumbsIntegration({ console: false, xhr: false, fetch: false, sentry: false }),
        ],
        // Demo mode can be entered on a dev build after launch, so it is asked per crumb and per event.
        beforeBreadcrumb: (crumb) => (isDemoMode() ? null : allowBreadcrumb(crumb)),
        beforeSend: (event) => (isDemoMode() ? null : allowEvent(event)),
    });

    setTrailSink((crumb) => Sentry.addBreadcrumb(crumb));
    AppState.addEventListener('change', (state) => Sentry.addBreadcrumb(lifecycleCrumb(state)));
}

const reporters = new Map<Boundary, (error: Error, info: ErrorInfo) => void>();

/**
 * `ErrorBoundary`'s `onError`, one function per boundary so a memoised pane is
 * handed the same one every render.
 */
export function renderErrorReporter(boundary: Boundary): (error: Error, info: ErrorInfo) => void {
    let reporter = reporters.get(boundary);
    if (!reporter) {
        reporter = (error, info) => {
            if (!CRASH_REPORTS_ON) return;
            Sentry.captureException(error, {
                tags: { boundary },
                contexts: { react: { componentStack: info.componentStack ?? '' } },
            });
        };
        reporters.set(boundary, reporter);
    }
    return reporter;
}

export type ProblemReport = { queued: true; ref: string } | { queued: false };

/**
 * "Report a problem". Breadcrumbs only leave the phone attached to an event,
 * so a glitch that did not crash sends nothing until this is pressed. `ref` is
 * the start of the event id, which the person on the phone can read out.
 *
 * Queued, not sent: the SDK keeps the event on disk and delivers it when
 * GlitchTip answers, which in a power cut is later. A flush would only hand it
 * to the native transport, so there is no delivery to wait for here.
 */
export function reportProblem(): ProblemReport {
    if (!CRASH_REPORTS_ON || isDemoMode()) return { queued: false };
    const id = Sentry.captureMessage(PROBLEM_REPORT, { level: 'info', tags: { report: 'problem' } });
    return { queued: true, ref: id.slice(0, 8) };
}

export function tagRole(role: ClientRole): void {
    if (CRASH_REPORTS_ON) Sentry.setTag('role', role);
}
