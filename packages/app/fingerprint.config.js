/**
 * What the runtime version (`runtimeVersion.policy: fingerprint` in app.json)
 * hashes. The fingerprint is what decides which APKs an OTA update reaches, so
 * it should change when native code does and at no other time.
 *
 * Out of the box it also hashes `expo.version`. Every release is numbered
 * (`scripts/releaseVersion.ts`), so every APK and every update would get a
 * runtime of its own and no update would ever reach a phone. Skipping the
 * version fields keeps the runtime a hash of native code alone.
 *
 * The skips are names, not `SourceSkips` flags: `@expo/fingerprint` cannot be
 * required from here in bun's layout, and a config that fails to load is
 * silently replaced by an empty one. `app.config.test.ts` checks it loads.
 */
module.exports = {
    sourceSkips: ['ExpoConfigVersions', 'PackageJsonAndroidAndIosScriptsIfNotContainRun'],
};
