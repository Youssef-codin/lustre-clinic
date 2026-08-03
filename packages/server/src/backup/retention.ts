/**
 * SPEC §16 — retention is ~14 daily / 8 weekly / 12 monthly, pruned
 * automatically.
 *
 * Pure functions over a list of dumps, so the policy is testable without
 * touching a filesystem. Bucket the dumps by day, ISO week, and month; keep the
 * newest dump in each of the most recent N buckets of each kind; delete
 * whatever is in none of those sets.
 */

export interface BackupFile {
    readonly name: string;
    readonly at: Date;
}

export interface RetentionPolicy {
    readonly daily: number;
    readonly weekly: number;
    readonly monthly: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { daily: 14, weekly: 8, monthly: 12 };

/** All keys are UTC — the machine's local time is not the backup's business. */
function dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
    return d.toISOString().slice(0, 7);
}

/** ISO-8601 week, so a week always starts on Monday regardless of locale. */
function weekKey(d: Date): string {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // Thursday of the current ISO week determines the year and week number.
    const dayOfWeek = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dayOfWeek + 3);
    const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);
    const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Newest dump in each of the most recent `count` buckets. */
function keepByBucket(sorted: readonly BackupFile[], key: (d: Date) => string, count: number): Set<string> {
    const kept = new Set<string>();
    const seen = new Set<string>();

    for (const file of sorted) {
        const bucket = key(file.at);
        if (seen.has(bucket)) continue;
        if (seen.size >= count) break;
        seen.add(bucket);
        kept.add(file.name);
    }

    return kept;
}

export function selectRetained(
    files: readonly BackupFile[],
    policy: RetentionPolicy = DEFAULT_RETENTION,
): Set<string> {
    const sorted = [...files].sort((a, b) => b.at.getTime() - a.at.getTime());

    return new Set([
        ...keepByBucket(sorted, dayKey, policy.daily),
        ...keepByBucket(sorted, weekKey, policy.weekly),
        ...keepByBucket(sorted, monthKey, policy.monthly),
    ]);
}

/** The complement of `selectRetained`, in newest-first order. */
export function selectForDeletion(
    files: readonly BackupFile[],
    policy: RetentionPolicy = DEFAULT_RETENTION,
): BackupFile[] {
    const retained = selectRetained(files, policy);
    return [...files].sort((a, b) => b.at.getTime() - a.at.getTime()).filter((f) => !retained.has(f.name));
}
