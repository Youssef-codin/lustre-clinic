/**
 * The native values `appVersion.ts` formats, and the APK check Settings draws as
 * a banner.
 *
 * The check is prod-only: a dev build is signed with the debug key and a demo
 * has no server, and neither can install the clinic's APK over itself. Offline,
 * the query fails quietly and there is no banner. The connection card already
 * says the server is not answering.
 */
import { APK_PATH } from '@lustre/shared';
import { useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { BUILD_VARIANT, serverAddresses, useTRPC } from '../../../api';
import { type InstalledVersion, newerApk } from './appVersion';

export function installedVersion(): InstalledVersion {
    return {
        // An update's manifest carries the config it was published with, so
        // this is the update's number on an update and the APK's otherwise.
        version: Constants.expoConfig?.version ?? null,
        apkVersion: Application.nativeApplicationVersion,
        build: Application.nativeBuildVersion,
        updateId: Updates.isEnabled ? Updates.updateId : null,
        updateCreatedAt: Updates.createdAt,
        embedded: Updates.isEmbeddedLaunch,
    };
}

export interface ApkUpdate {
    version: string;
    versionCode: number;
    url: string;
}

export function useApkUpdate(): ApkUpdate | null {
    const trpc = useTRPC();
    const prod = BUILD_VARIANT === 'prod';
    // Hourly while mounted: the home banner (`shell/ApkUpdateBanner`) lives as
    // long as the app does, and a phone that is never closed would otherwise
    // hear about a release only when Settings is opened.
    const latest = useQuery(
        trpc.release.latestApk.queryOptions(undefined, { enabled: prod, refetchInterval: 60 * 60_000 }),
    );

    const newer = prod ? newerApk(Application.nativeBuildVersion, latest.data) : null;
    const server = serverAddresses().tailscale;
    return newer && server ? { ...newer, url: `${server}${APK_PATH}` } : null;
}
