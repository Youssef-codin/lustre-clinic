/**
 * Every release APK gets a higher versionCode than the one before it. Android
 * refuses to install over a higher number, and the update banner in Settings
 * compares this one with the APK the clinic server has.
 *
 * It is the build time in minutes since 2026-01-01 UTC, stamped by Gradle. The
 * alternatives go wrong quietly: a hand-bumped `android.versionCode` gets
 * forgotten and two builds share a number, and a git commit count goes
 * backwards on a rebased branch or a shallow clone. A clock goes backwards only
 * when the build machine's is wrong. Two builds inside one minute share a
 * number, which Android still installs over. Minutes stay under Android's
 * 2,100,000,000 ceiling for four thousand years.
 *
 * Gradle rather than `app.config.ts`, because `device.sh --release` runs Gradle
 * on the existing `android/` without prebuilding again. Debug builds keep
 * `app.json`'s number, so an incremental dev build is not invalidated every
 * minute. `-PLUSTRE_VERSION_CODE=<n>` forces one, for jumping past a build made
 * on a machine whose clock was ahead.
 *
 * `expo.version` in app.json is the name the doctor reads out, and is still
 * bumped by hand when a native change ships.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @lustre: release versionCode (plugins/withReleaseVersionCode.js)';

/** 2026-01-01T00:00:00Z. Moving it later would number new builds below installed ones. */
const EPOCH_MS = 1_767_225_600_000;

const BLOCK = `${MARKER}
androidComponents {
    onVariants(selector().withBuildType('release')) { variant ->
        def forced = findProperty('LUSTRE_VERSION_CODE')
        int lustreVersionCode = forced ? forced.toInteger() : ((System.currentTimeMillis() - ${EPOCH_MS}L).intdiv(60000L)) as int
        variant.outputs.each { output -> output.versionCode.set(lustreVersionCode) }
    }
}
`;

function applyReleaseVersionCode(contents) {
    if (contents.includes(MARKER)) return contents;
    return `${contents.trimEnd()}\n\n${BLOCK}`;
}

/** What a build at `nowMs` is numbered, mirrored from the Gradle above for the tests. */
function versionCodeAt(nowMs) {
    return Math.floor((nowMs - EPOCH_MS) / 60_000);
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
