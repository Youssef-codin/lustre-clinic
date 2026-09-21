/**
 * Every release APK gets a higher versionCode than the one before it. Android
 * refuses to install over a higher number, and the update banner in Settings
 * offers an APK only when its number is strictly higher than the installed one.
 *
 * It is the build time in tens of seconds since 2026-01-01 UTC, stamped by
 * Gradle. A release build takes minutes, so two builds never share a number, and
 * `bun release:apk` refuses to stage one that is not higher than the APK already
 * staged. The alternatives go wrong quietly: a hand-bumped `android.versionCode`
 * gets forgotten and two builds share a number, and a git commit count goes
 * backwards on a rebased branch or a shallow clone. A clock goes backwards only
 * when the build machine's is wrong. Tens of seconds stay under Android's
 * 2,100,000,000 ceiling for six hundred years.
 *
 * Gradle rather than `app.config.ts`, because `device.sh --release` runs Gradle
 * on the existing `android/` without prebuilding again. Debug builds keep
 * `app.json`'s number, so an incremental dev build is not invalidated every
 * few seconds. `-PLUSTRE_VERSION_CODE=<n>` (or `ORG_GRADLE_PROJECT_LUSTRE_VERSION_CODE`)
 * forces one, for jumping past a build made on a machine whose clock was ahead.
 *
 * The name the doctor reads out is `versionName`, which `scripts/release.ts`
 * works out and passes in as `LUSTRE_VERSION` (`scripts/releaseVersion.ts`).
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @lustre: release versionCode (plugins/withReleaseVersionCode.js)';

/** 2026-01-01T00:00:00Z. Moving it later would number new builds below installed ones. */
const EPOCH_MS = 1_767_225_600_000;

/** One versionCode step. Shorter than any release build; a longer one would let two builds collide. */
const STEP_MS = 10_000;

const BLOCK = `${MARKER}
androidComponents {
    ['release', 'devRelease'].each { buildType ->
        onVariants(selector().withBuildType(buildType)) { variant ->
            def forced = findProperty('LUSTRE_VERSION_CODE')
            int lustreVersionCode = forced ? forced.toInteger() : ((System.currentTimeMillis() - ${EPOCH_MS}L).intdiv(${STEP_MS}L)) as int
            variant.outputs.each { output -> output.versionCode.set(lustreVersionCode) }
        }
    }
}
`;

function applyReleaseVersionCode(contents) {
    if (contents.includes(MARKER)) return contents;
    return `${contents.trimEnd()}\n\n${BLOCK}`;
}

/** What a build at `nowMs` is numbered, mirrored from the Gradle above for the tests. */
function versionCodeAt(nowMs) {
    return Math.floor((nowMs - EPOCH_MS) / STEP_MS);
}

module.exports = function withReleaseVersionCode(config) {
    return withAppBuildGradle(config, (cfg) => {
        cfg.modResults.contents = applyReleaseVersionCode(cfg.modResults.contents);
        return cfg;
    });
};

module.exports.applyReleaseVersionCode = applyReleaseVersionCode;
module.exports.versionCodeAt = versionCodeAt;
module.exports.EPOCH_MS = EPOCH_MS;
module.exports.STEP_MS = STEP_MS;
