/**
 * When local mode's clinic last left the phone. `./local` keeps it on file and
 * sets it here on opening and on every export; it lives apart from `./local`
 * so `handlers/backup` reads it without bringing the file system along.
 */
let at: Date | null = null;

export function lastExportAt(): Date | null {
    return at;
}

export function noteLastExportAt(next: Date | null): void {
    at = next;
}
