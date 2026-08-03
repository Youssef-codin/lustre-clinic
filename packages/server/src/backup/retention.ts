/**
 * SPEC §16 — retention is ~14 daily / 8 weekly / 12 monthly, pruned
 * automatically.
 *
 * Pure functions over a list of dumps, so the policy is testable without
 * touching a filesystem. Bucket the dumps by day, ISO week, and month; keep the
 * newest dump in each of the most recent N buckets of each kind; delete
 * whatever is in none of those sets.
 */

/**
 * The dump file name carries the timestamp retention sorts on, and it lives
 * here rather than beside the run because every destination has to be able to
 * read one back — a name that cannot be parsed is a file pruning must not touch.
 */
const FILE_PREFIX = 'mawid-';
const FILE_SUFFIX = '.dump';

/** `mawid-2026-08-03T08-41-32Z.dump` — sortable, filesystem-safe, UTC. */
export function backupFileName(at: Date): string {
    const stamp = at
        .toISOString()
        .replace(/\.\d+Z$/, 'Z')
        .replaceAll(':', '-');
    return `${FILE_PREFIX}${stamp}${FILE_SUFFIX}`;
}

export function parseBackupFileName(name: string): Date | null {
    if (!name.startsWith(FILE_PREFIX) || !name.endsWith(FILE_SUFFIX)) return null;

    const stamp = name.slice(FILE_PREFIX.length, -FILE_SUFFIX.length);
    // Undo the `:` → `-` substitution in the time part only.
    const iso = stamp.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z');
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? null : at;
}

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
