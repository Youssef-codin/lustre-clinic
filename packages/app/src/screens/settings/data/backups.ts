/**
 * What `backup.status` means on the settings index (SPEC §16).
 *
 * Three states, and only one of them is loud. A revoked or expired Google grant
 * is the one the doctor has to be told about in words: the nightly dump still
 * runs and still verifies, so nothing on the phone looks wrong, while the only
 * copy that survives the clinic burning down stopped being written. Stale is
 * quieter — the §17 Discord alert already went out and the cause is usually a
 * machine that was off. Everything else is a sub-line nobody needs to read.
 *
 * The age is deliberately coarse. "3 days" is what decides whether this is
 * ignored until Monday; a minute count would be false precision on a number
 * that is only ever read to answer "how bad is it".
 */
export interface BackupStatusData {
    lastSuccessAt: string | null;
    stale: boolean;
    staleAfterHours: number;
    offsite: {
        configured: boolean;
        reauthorizationRequiredSince: string | null;
    };
}

export type BackupTone = 'ok' | 'stale' | 'reauthorize';

export interface BackupView {
    tone: BackupTone;
    /** The settings row's sub — always present, like every other row's. */
    sub: string;
    /** The card's second line, or null when there is no card to draw. */
    detail: string | null;
}

export function ageInDays(since: string, now: number): number | null {
    const at = new Date(since).getTime();
    if (Number.isNaN(at)) return null;
    return Math.max(0, Math.floor((now - at) / 86_400_000));
}

/** A duration, not a date: "2 days ago" is when it broke, which is not the question. */
function stoppedFor(days: number | null): string {
    if (days === null || days < 1) return 'The off-site copy has stopped.';
    if (days === 1) return 'The off-site copy has been stopped since yesterday.';
    return `The off-site copy has been stopped for ${days} days.`;
}

export function formatAge(days: number): string {
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
}

function lastLine(lastSuccessAt: string | null, now: number): string {
    if (!lastSuccessAt) return 'No backup yet';
    const days = ageInDays(lastSuccessAt, now);
    if (days === null) return 'No backup yet';
    return `Last backup ${formatAge(days)}`;
}

export function backupView(status: BackupStatusData, now: number = Date.now()): BackupView {
    const last = lastLine(status.lastSuccessAt, now);
    const since = status.offsite.reauthorizationRequiredSince;

    if (since) {
        return {
            tone: 'reauthorize',
            sub: 'Google Drive needs a new sign-in',
            detail: `${stoppedFor(ageInDays(since, now))} Ask whoever set up the clinic server to sign in to Google Drive again.`,
        };
    }

    if (status.stale) {
        return {
            tone: 'stale',
            sub: last,
            detail: `No backup has finished in the last ${status.staleAfterHours} hours.`,
        };
    }

    return {
        tone: 'ok',
        sub: status.offsite.configured ? `${last} · copied off-site` : `${last} · on this machine only`,
        detail: null,
    };
}
