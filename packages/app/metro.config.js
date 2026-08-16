// Monorepo setup: Metro must watch the workspace root so `@lustre/shared` and
// the `AppRouter` type from `@lustre/server` resolve from packages/, and must
// resolve modules from both the package and the root node_modules.
//
// Hierarchical lookup must stay ON. Bun installs are isolated, so a package's
// dependencies live under `node_modules/.bun/<pkg>@<hash>/node_modules/` rather
// than hoisted to the root; disabling the upward walk — the usual Expo monorepo
// advice, written for hoisted layouts — makes expo-dev-client's re-exports
// unresolvable and the bundle fails.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = false;

// Watching the workspace root (above) is necessary, but it also puts Gradle's
// output tree and the git directory under the file watcher — tens of thousands
// of files that churn constantly during a native build, all of them indexed
// into the haste map for nothing. On a memory-tight machine that is watchman
// and Metro competing with the build that is producing the churn.
config.resolver.blockList = [
    /\/android\/build\/.*/,
    /\/android\/\.gradle\/.*/,
    /\/android\/app\/build\/.*/,
    /\/\.git\/.*/,
];

module.exports = config;
