// `jsxImportSource: 'nativewind'` is what turns `className` on a React Native
// primitive into styles. Without it every className is silently ignored.
//
// Presets are resolved with `require.resolve` rather than by name. Babel resolves
// bare preset names relative to @babel/core, and Bun's isolated install puts
// these under `node_modules/.bun/<pkg>@<hash>/`, out of that module's reach.
module.exports = (api) => {
    api.cache(true);
    return {
        presets: [
            [require.resolve('babel-preset-expo'), { jsxImportSource: 'nativewind' }],
            require.resolve('nativewind/babel'),
        ],
    };
};
