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
