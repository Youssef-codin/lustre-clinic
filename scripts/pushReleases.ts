/**
 * `bun ship:dev --fast`'s deploy: copies dist/releases-dev to the dev stack in
 * one tar stream over SSH, sending only what the server lacks. `play app`
 * rebuilds the server and has Ansible checksum every staged file one by one,
 * which is most of a dev ship. Dev only, and it never touches the server code.
 *
 * Everything under an update id is written once, so a path the server already
 * has is skipped. The pointers (`updates/<runtime>/latest.json`, `android/*`)
 * are rewritten by releases, so those go by checksum, and last: the update
 * they name has landed by the time they do.
 */
import { join, resolve } from 'node:path';
import { $ } from 'bun';

const ROOT = resolve(import.meta.dir, '..');
const LOCAL = join(ROOT, 'dist/releases-dev');
const HOST = process.env.LUSTRE_DEV_SSH ?? 'youssef@100.125.78.21';
const REMOTE = '/opt/lustre-dev/releases';

function pointerRank(path: string): number {
    if (path === 'android/latest.json') return 3;
    if (path.startsWith('android/')) return 2;
    if (/^updates\/[^/]+\/latest\.json$/.test(path)) return 1;
    return 0;
}

async function sha256(path: string): Promise<string> {
    return new Bun.CryptoHasher('sha256').update(await Bun.file(path).arrayBuffer()).digest('hex');
}

async function remote(command: string): Promise<string> {
    const result = await $`ssh -o BatchMode=yes ${HOST} ${command}`.quiet().nothrow();
    if (result.exitCode !== 0) {
        process.stderr.write(result.stderr);
        throw new Error(`ssh ${HOST} failed`);
    }
    return result.stdout.toString();
}

const local = Array.from(new Bun.Glob('**/*').scanSync({ cwd: LOCAL, onlyFiles: true }));
const present = new Set(
    (await remote(`mkdir -p ${REMOTE} && cd ${REMOTE} && find . -type f -printf '%P\\n'`)).split('\n'),
);
const remoteSums = new Map(
    (await remote(`cd ${REMOTE} && sha256sum android/* updates/*/latest.json 2>/dev/null || true`))
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const [sum, path] = line.split(/\s+/, 2);
            return [path, sum] as const;
        }),
);

const send: string[] = [];
for (const path of local) {
    if (!present.has(path)) send.push(path);
    else if (pointerRank(path) > 0 && remoteSums.get(path) !== (await sha256(join(LOCAL, path))))
        send.push(path);
}
send.sort((a, b) => pointerRank(a) - pointerRank(b));

if (!send.length) {
    process.stdout.write('The dev stack already has every staged release.\n');
    process.exit(0);
}

process.stdout.write(`Sending ${send.length} of ${local.length} files to ${HOST}:${REMOTE}.\n`);
if (process.argv.includes('--dry-run')) {
    process.stdout.write(`${send.join('\n')}\n`);
    process.exit(0);
}
const copied =
    await $`tar -C ${LOCAL} -cf - ${send} | ssh -o BatchMode=yes ${HOST} tar -C ${REMOTE} -xf -`.nothrow();
if (copied.exitCode !== 0) {
    process.stderr.write(
        'pushReleases: the copy failed. Run it again, or `bun ship deploy --dev` for the full play.\n',
    );
    process.exit(1);
}
process.stdout.write('Releases are on the dev stack.\n');
