// Monorepo setup: Metro must watch the workspace root so `@mawid/shared` and
// the `AppRouter` type from `@mawid/server` resolve from packages/, and must
// resolve modules from both the package and the root node_modules.
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
// Hierarchical lookup must stay ON. Bun installs isolated, so a package's own
// dependencies live in a sibling `node_modules` next to it under
// `node_modules/.bun/<pkg>@<hash>/node_modules/` rather than hoisted to the
// root. Disabling the upward walk — the usual Expo monorepo advice, written for
// hoisted layouts — makes those unresolvable: expo-dev-client re-exports
// expo-dev-menu, and the bundle fails outright without this.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
