/**
 * The whole release, from `main` to the clinic (infra/RELEASING.md).
 *
 *   bun ship [--minor]          an OTA update: a quiet patch, or a minor the phones take now
 *   bun ship --apk [--major]    a new APK, for a native change
 *   bun ship --dry-run          prints the number and changes nothing
 *   bun ship deploy             the deploy step alone, for the release at HEAD
 *   bun ship:dev [--apk]        the dev track, to the dev stack
 *
 * In order: checks `main` is clean and not behind origin, asks `release.ts` for
 * the number, moves `[Unreleased]` in CHANGELOG.md under it and commits, builds
 * and stages the release (which tags it), pushes `main` and the tag, then runs
 * `play app`, which builds the server and deploys it with the releases.
 *
 * Run it again after a failure: a changelog already cut for the number is kept,
 * and every message says what to run next. The dev track cuts no changelog and
 * pushes nothing: its `dev-v*` tags stay here. It also ships the same commit
 * again, since testing an update on a phone takes several in a row.
 */
import { join, resolve } from 'node:path';
import { $ } from 'bun';
import { cutChangelog } from './cutChangelog';

const ROOT = resolve(import.meta.dir, '..');
const RELEASE = join(ROOT, 'packages/app/scripts/release.ts');
const CHANGELOG = join(ROOT, 'CHANGELOG.md');
/** What `build:server` compiles. The deploy builds from the working tree, so these must match the tag. */
const SERVER_PATHS = ['packages/server', 'packages/shared', 'bun.lock', 'package.json'];

const args = process.argv.slice(2);
const deployOnly = args[0] === 'deploy';
const dev = args.includes('--dev');
const apk = args.includes('--apk');
const dryRun = args.includes('--dry-run');
const known = ['deploy', '--dev', '--apk', '--major', '--minor', '--dry-run'];
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
    if (dev) return;

    const released = await git('tag', '--points-at', 'HEAD', '--list', `${tagPrefix}[0-9]*`);
    if (released) {
        fail(
            `HEAD is already released as ${released.split('\n')[0]}. Nothing new to ship. If it never reached the server, run \`bun ship deploy${dev ? ' --dev' : ''}\`.`,
        );
    }

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

/** Builds the server and deploys it with the staged releases (`play app`). */
async function deploy(): Promise<void> {
    const tag = await releaseTagAt('HEAD');
    if (!tag) fail(`no ${tagPrefix}X.Y.Z tag at or before HEAD. Ship one first.`);
    if (!(await gitSucceeds('diff', '--quiet', tag, 'HEAD', '--', ...SERVER_PATHS))) {
        fail(
            `the server code changed after ${tag}, so this would deploy code no release has. Ship again instead.`,
        );
    }
    say(`Deploying the server and ${tag} to ${stack}. The sudo password is for the clinic server.`);
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
    say(
        `Would build ${apk ? 'the APK' : 'the update and the APK'}, tag ${tag}${dev ? '' : ', push main and the tag'}, and deploy the server and releases to ${stack}.`,
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
