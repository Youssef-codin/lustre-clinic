// Which OTA updates stop the phone. Pure, so `bun test` reaches it; the screen
// is `UpdateScreen.tsx`.
//
// An update's number says how big it is (`scripts/releaseVersion.ts`). A patch
// downloads in the background and runs on the next launch, because a reload
// mid-screen would cost the desk a half-filled booking. A minor is a release
// the clinic should be on now: the phone shows a download screen over whatever
// it was on and restarts itself into it, rather than leaving someone to close
// and reopen the app until it takes. A patch shipped with `--screen` does the
// same without moving the number.

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parse(text: string | null | undefined): [number, number] | null {
    const match = text?.trim().match(VERSION);
    return match ? [Number(match[1]), Number(match[2])] : null;
}

function metadataOf(manifest: unknown): Record<string, unknown> | null {
    if (typeof manifest !== 'object' || manifest === null) return null;
    const metadata = (manifest as { metadata?: unknown }).metadata;
    return typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>) : null;
}

/** The number an update was published as: `metadata.version` in its manifest (`scripts/updateManifest.ts`). */
export function manifestVersion(manifest: unknown): string | null {
    const version = metadataOf(manifest)?.version;
    return typeof version === 'string' ? version : null;
}

/** A patch shipped with `bun ship --screen`, which takes the download screen like a minor. */
export function manifestWantsScreen(manifest: unknown): boolean {
    return metadataOf(manifest)?.screen === 'true';
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
 * How soon after coming back to the app a patch that finishes downloading still
 * restarts it. Long enough for the download the return starts; short enough
 * that nobody has started typing yet.
 */
export const RELOAD_WINDOW_MS = 10_000;

/** How often an open app looks for an update, so a patch is usually on the phone before the next return. */
export const CHECK_EVERY_MS = 15 * 60_000;

/**
 * Whether the app, back on screen for `msSinceReturn`, should restart into a
 * downloaded update. Any return counts, a hop to WhatsApp included: that is the
 * moment nothing is half-typed. Opening the app counts as a return. `null` is
 * before the app has drawn at all.
 */
export function reloadOnReturn(updatePending: boolean, msSinceReturn: number | null, held: boolean): boolean {
    return updatePending && !held && msSinceReturn !== null && msSinceReturn < RELOAD_WINDOW_MS;
}

let holds = 0;

/**
 * Runs `task`, a flow that leaves the app and needs the same app when it comes
 * back (Google's sign-in, the permission dialog), with no update restart until
 * it has finished. The return that ends it would otherwise reload mid-flow.
 */
export async function withUpdatesHeld<T>(task: () => Promise<T>): Promise<T> {
    holds += 1;
    try {
        return await task();
    } finally {
        holds -= 1;
    }
}

export function updatesHeld(): boolean {
    return holds > 0;
}
