/**
 * Local mode's file: the whole clinic as one JSON document in the app's own
 * storage. Not AsyncStorage, which Android caps at a few megabytes and cannot
 * read a single value much past two — a few years of a clinic outgrows both.
 *
 * Writing is synchronous and goes to a second file first, which is then moved
 * over the first. A write cut off part way leaves the last good copy behind,
 * and the copy moved over it is complete, so a read tries the main file and
 * falls back to the next one.
 */
import { File, Paths } from 'expo-file-system';
import { getDb, setDb } from './db';
import { freshLocalDb, LocalStoreError, parseLocal, serializeLocal } from './localFormat';

const MAIN = 'lustre-local.json';
const NEXT = 'lustre-local.next.json';

function file(name: string): File {
    return new File(Paths.document, name);
}

function read(): ReturnType<typeof parseLocal> | null {
    const candidates = [file(MAIN), file(NEXT)].filter((candidate) => candidate.exists);
    if (candidates.length === 0) return null;

    let failure: unknown = null;
    for (const candidate of candidates) {
        try {
            return parseLocal(candidate.textSync());
        } catch (error) {
            failure = error;
        }
    }
    throw failure instanceof LocalStoreError
        ? failure
        : new LocalStoreError('the clinic file could not be read');
}

/** Writes what is open now. Throws when the phone would not take it. */
export function commitLocal(): void {
    const next = file(NEXT);
    next.write(serializeLocal(getDb()));
    next.moveSync(file(MAIN), { overwrite: true });
}

/** The clinic on file, or a new one written down at once so its ids are the ones kept. */
export function openLocalDb(): void {
    const stored = read();
    if (stored) {
        setDb(stored, 'local');
        return;
    }
    setDb(freshLocalDb(), 'local');
    commitLocal();
}

/**
 * Back to what is on file, after a request that failed: a handler can have
 * changed rows before it refused, and the server's transaction would have
 * thrown those away too.
 */
export function rollbackLocal(): void {
    setDb(read() ?? freshLocalDb(), 'local');
}
