/**
 * A dump only gets its final `lustre-<stamp>.dump` name once it is complete,
 * has passed the restore check, and is on disk. The operator's pull copies any
 * file with that name, and retention counts it as a good copy, so a name given
 * early lets a partial or unverified dump leave the server or push a good one
 * out of retention.
 *
 * Until then the dump lives at `<name>.<attempt>.partial`, which neither the
 * pull nor retention will match. A run killed part-way (a deploy, a crash, a
 * power cut) leaves only that file, and the next boot deletes it.
 *
 * The rename is only durable once the folder is synced too. Without that, a
 * crash soon after a run can lose the new name after older dumps were pruned.
 */
import { open, readdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseBackupFileName } from './retention.ts';

// `<name>.<attempt>.partial`. Two runs in the same second share a final name,
// so each attempt writes its own file and neither can delete or rename the
// other's. Whichever renames last wins, and both passed the check.
const PARTIAL = /^(.+)\.[0-9a-f-]+\.partial$/;

async function fsync(path: string): Promise<void> {
    const handle = await open(path, 'r');
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
}

/**
 * `produce` writes the dump to the path it is given and checks it, throwing if
 * either fails. Nothing ends up at `path` unless it returns.
 */
export async function commitDump(
    path: string,
    produce: (partialPath: string) => Promise<void>,
): Promise<void> {
    const partial = `${path}.${Bun.randomUUIDv7()}.partial`;

    try {
        await produce(partial);
        await fsync(partial);
        await rename(partial, path);
    } catch (err) {
        await unlink(partial).catch(() => {});
        throw err;
    }

    await fsync(dirname(path));
}

export async function removePartialDumps(directory: string): Promise<string[]> {
    let names: string[];
    try {
        names = await readdir(directory);
    } catch {
        return [];
    }

    const partials = names.filter((name) => {
        const final = PARTIAL.exec(name)?.[1];
        return final !== undefined && parseBackupFileName(final) !== null;
    });
    for (const name of partials) {
        await unlink(join(directory, name));
    }
    return partials;
}
