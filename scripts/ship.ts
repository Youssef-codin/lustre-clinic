/**
 * A release from `main` to the clinic in one command (infra/RELEASING.md).
 *
 *   bun ship [--minor]              an OTA update: a quiet patch, or a minor the phones take now
 *   bun ship --apk [--major]        a new APK, for a native change
 *   bun ship --dev [--apk]          the same on the dev track, to the dev stack
 *   bun ship … --dry-run            say what it would do and change nothing
 *   bun ship deploy [--dev] [--server]  only the last step, again: the latest release onto the server
 *
 * In order: checks `main` is clean and not behind origin, asks `release.ts` for
 * the number, moves `[Unreleased]` in CHANGELOG.md under it and commits, builds
 * and stages the release (which tags it), pushes `main` and the tag, and deploys.
 *
 * The deploy redeploys the server too (`build:server`, then `play app`) when
 * the server, `shared` or the lockfile changed since the previous release, and
 * otherwise only copies the releases (`play releases`). `--server` forces it.
 *
 * Every step survives running again: a changelog already cut for the number is
 * kept, and a deploy that failed (the sudo password, the tailnet) is `bun ship deploy`.
 * The dev track cuts no changelog and pushes nothing: its `dev-v*` tags stay here.
 */
import { join, resolve } from 'node:path';
import { $ } from 'bun';
import { cutChangelog } from './cutChangelog';

const ROOT = resolve(import.meta.dir, '..');
const RELEASE = join(ROOT, 'packages/app/scripts/release.ts');
const CHANGELOG = join(ROOT, 'CHANGELOG.md');
/** What the compiled server is built from. A change here needs `play app`, not just the releases. */
const SERVER_PATHS = ['packages/server', 'packages/shared', 'bun.lock'];

const args = process.argv.slice(2);
const deployOnly = args[0] === 'deploy';
const dev = args.includes('--dev');
const apk = args.includes('--apk');
const dryRun = args.includes('--dry-run');
const forceServer = args.includes('--server');
const known = ['deploy', '--dev', '--apk', '--major', '--minor', '--dry-run', '--server'];
const unknown = args.filter((arg) => !known.includes(arg));
if (unknown.length) fail(`unknown ${unknown.join(' ')}. See the top of scripts/ship.ts.`);
if (args.includes('--major') && !apk) fail('--major is for an APK: bun ship --apk --major');
if (args.includes('--minor') && apk) fail('--minor is for an update. An APK is always at least a minor.');

const stack = dev ? 'dev' : 'prod';
const tagPrefix = dev ? 'dev-v' : 'v';
const trackEnv = { ...process.env, LUSTRE_RELEASE_TRACK: dev ? 'development' : 'production' };

function say(line: string): void {
    process.stdout.write(`\n» ${line}\n`);
}

function fail(line: string): never {
    process.stderr.write(`ship: ${line}\n`);
    process.exit(1);
}

async function git(...parts: string[]): Promise<string> {
    const result = await $`git ${parts}`.cwd(ROOT).quiet().nothrow();
    if (result.exitCode !== 0) fail(`git ${parts.join(' ')}: ${result.stderr.toString().trim()}`);
    return result.stdout.toString().trim();
}

async function gitSucceeds(...parts: string[]): Promise<boolean> {
    return (await $`git ${parts}`.cwd(ROOT).quiet().nothrow()).exitCode === 0;
}

/** Runs on this terminal, so the build's progress and the sudo prompt reach the person shipping. */
async function run(
    command: string[],
    env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
    const child = Bun.spawn(command, { cwd: ROOT, env, stdio: ['inherit', 'inherit', 'inherit'] });
    return (await child.exited) === 0;
}

/** The newest release tag at or before `ref`, or null. */
async function releaseTagAt(ref: string): Promise<string | null> {
    const result = await $`git describe --tags --abbrev=0 --match ${`${tagPrefix}[0-9]*`} ${ref}`
        .cwd(ROOT)
        .quiet()
        .nothrow();
    return result.exitCode === 0 ? result.stdout.toString().trim() : null;
}

async function serverChanged(since: string | null, until: string): Promise<boolean> {
    if (!since) return true;
    return !(await gitSucceeds('diff', '--quiet', since, until, '--', ...SERVER_PATHS));
}

async function nextVersion(): Promise<string> {
    const flags = args.filter((arg) => arg === '--major' || arg === '--minor');
    const result = await $`bun ${RELEASE} next ${apk ? 'apk' : 'update'} ${flags}`
        .cwd(ROOT)
        .env(trackEnv)
        .quiet()
        .nothrow();
    if (result.exitCode !== 0) {
        process.stderr.write(result.stderr);
        fail('could not work out the next number. Nothing was changed.');
    }
    return result.stdout.toString().trim().split('\n').at(-1) ?? '';
}

async function preflight(): Promise<void> {
    if (await git('status', '--porcelain')) {
        fail('the working tree has uncommitted changes. Commit or stash them first.');
    }
    const released = await git('tag', '--points-at', 'HEAD', '--list', `${tagPrefix}[0-9]*`);
    if (released) {
        fail(
            `HEAD is already released as ${released.split('\n')[0]}. Nothing new to ship. If it never reached the server, run \`bun ship deploy${dev ? ' --dev' : ''}\`.`,
        );
    }
    if (dev) return;

    if ((await git('branch', '--show-current')) !== 'main')
        fail('ship from main. The dev track (--dev) ships any branch.');
    await git('fetch', '--quiet', 'origin', 'main');
    if (!(await gitSucceeds('merge-base', '--is-ancestor', 'origin/main', 'HEAD'))) {
        fail('main is behind origin/main. Pull first, so the release has everything already merged.');
    }
}

/** Opens the release in CHANGELOG.md and commits it, so the tag carries its notes. */
async function cutRelease(version: string): Promise<void> {
    const today = new Date().toLocaleDateString('en-CA');
    let cut: string | null;
    try {
        cut = cutChangelog(await Bun.file(CHANGELOG).text(), version, today);
    } catch (error) {
        fail((error as Error).message);
    }
    if (!cut) {
        say(`CHANGELOG.md already has ${version}. Keeping it.`);
        return;
    }
    if (dryRun) {
        say(`Would move [Unreleased] under ${version} in CHANGELOG.md and commit it.`);
        return;
    }
    await Bun.write(CHANGELOG, cut);
    await git('commit', '--quiet', '--message', `docs(changelog): ${version}`, '--', 'CHANGELOG.md');
    say(`Moved [Unreleased] under ${version} and committed it.`);
}

/** Puts the release tagged at HEAD's newest release onto the server. */
async function deploy(): Promise<void> {
    const tag = await releaseTagAt('HEAD');
    if (!tag) fail(`no ${tagPrefix}X.Y.Z tag at or before HEAD. Ship one first.`);
    const previous = await releaseTagAt(`${tag}^`);
    const server = forceServer || (await serverChanged(previous, tag));

    if (!server) {
        say(`Nothing on the server changed since ${previous}. Copying the releases to ${stack}.`);
        if (dryRun) return;
        if (!(await run(['scripts/play.sh', 'releases', `--stack=${stack}`]))) deployFailed(tag);
        return;
    }

    // The server is built from the working tree, so it has to be the release's code.
    if ((await git('rev-parse', 'HEAD')) !== (await git('rev-parse', `${tag}^{commit}`))) {
        fail(
            `HEAD is past ${tag}, and the server would be built from code that isn't in it. Check out ${tag}, or ship again.`,
        );
    }
    say(
        `${forceServer ? 'Deploying the server as asked' : `The server changed since ${previous ?? 'the start'}`}. Building it and deploying it with the releases to ${stack}.`,
    );
    if (dryRun) return;
    if (!(await run(['bun', 'run', 'build:server']))) fail('the server build failed. Nothing was deployed.');
    if (!(await run(['scripts/play.sh', 'app', `--stack=${stack}`]))) deployFailed(tag);
}

function deployFailed(tag: string): never {
    fail(
        `${tag} is built and tagged, but it is not on the server. Fix what the play said, then run \`bun ship deploy${dev ? ' --dev' : ''}\`.`,
    );
}

if (deployOnly) {
    await deploy();
    process.exit(0);
}

await preflight();
const version = await nextVersion();
const tag = `${tagPrefix}${version}`;
say(`Shipping ${tag}${dev ? ' on the dev track' : ''}${dryRun ? ' (dry run)' : ''}.`);

if (!dev) await cutRelease(version);
if (dryRun) {
    const server = forceServer || (await serverChanged(await releaseTagAt('HEAD'), 'HEAD'));
    say(
        `Would build ${apk ? 'the APK' : 'the update and the APK'}, tag ${tag}${dev ? '' : ', push main and the tag'}, and ${server ? 'deploy the server with the releases' : 'copy the releases'} to ${stack}.`,
    );
    process.exit(0);
}

const releaseArgs = [apk ? 'apk' : 'update', ...args.filter((arg) => arg === '--major' || arg === '--minor')];
if (!(await run(['bun', RELEASE, ...releaseArgs], { ...trackEnv, LUSTRE_EXPECT_VERSION: version }))) {
    fail(`the ${version} build failed. Nothing was tagged or deployed. Fix it and run \`bun ship\` again.`);
}

if (!dev) {
    say(`Pushing main and ${tag}. GitHub publishes the release notes from the tag.`);
    if (!(await run(['git', 'push', '--atomic', 'origin', 'main', tag]))) {
        fail(
            `the push failed. Push by hand (git push --atomic origin main ${tag}), then run \`bun ship deploy\`.`,
        );
    }
}

await deploy();
say(`${tag} is out.`);
