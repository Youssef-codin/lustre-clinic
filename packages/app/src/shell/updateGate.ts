// Which OTA updates stop the phone. Pure, so `bun test` reaches it; the screen
// is `UpdateScreen.tsx`.
//
// An update's number says how big it is (`scripts/releaseVersion.ts`). A patch
// downloads in the background and runs on the next launch, because a reload
// mid-screen would cost the desk a half-filled booking. A minor is a release
// the clinic should be on now: the phone shows a download screen over whatever
// it was on and restarts itself into it, rather than leaving someone to close
// and reopen the app until it takes.

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parse(text: string | null | undefined): [number, number] | null {
    const match = text?.trim().match(VERSION);
    return match ? [Number(match[1]), Number(match[2])] : null;
}

/** The number an update was published as: `metadata.version` in its manifest (`scripts/updateManifest.ts`). */
export function manifestVersion(manifest: unknown): string | null {
    if (typeof manifest !== 'object' || manifest === null) return null;
    const metadata = (manifest as { metadata?: unknown }).metadata;
    if (typeof metadata !== 'object' || metadata === null) return null;
    const version = (metadata as { version?: unknown }).version;
    return typeof version === 'string' ? version : null;
}

/**
 * Whether `incoming` moves the major or the minor past what is `running`. An
 * update without a number, or a phone that cannot say what it runs, is treated
 * as a patch: the quiet path is the one that cannot lose anybody's typing.
 */
export function isMinorUpdate(
    running: string | null | undefined,
    incoming: string | null | undefined,
): boolean {
    const from = parse(running);
    const to = parse(incoming);
    if (!from || !to) return false;
    return to[0] > from[0] || (to[0] === from[0] && to[1] > from[1]);
}

/**
 * How long the app has to have been away before coming back reloads it into a
 * downloaded update. Long enough that a hop to WhatsApp from the reminders and
 * straight back never costs anyone their place; short enough that a phone
 * picked up after a patient leaves is on the new version without anybody
 * closing it.
 */
export const RELOAD_AFTER_AWAY_MS = 5 * 60_000;

/** Whether a return to the app counts: away at least `RELOAD_AFTER_AWAY_MS`. `null` is never having left. */
export function awayLongEnough(awayMs: number | null): boolean {
    return awayMs !== null && awayMs >= RELOAD_AFTER_AWAY_MS;
}

/**
 * Whether coming back to the app should restart it into an update that has
 * already downloaded. Any update, patch or minor: the patch no longer waits for
 * a cold start nobody makes, because Android keeps the app alive in the
 * background and "reopening" it is not one.
 */
export function reloadOnReturn(updatePending: boolean, awayMs: number | null): boolean {
    return updatePending && awayLongEnough(awayMs);
}
