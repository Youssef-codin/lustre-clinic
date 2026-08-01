import { watch } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import tailwind from 'bun-plugin-tailwind';

/**
 * Builds straight into `packages/server/public`, which the server serves
 * statically. One origin, one port — so the phone on the LAN hits the same URLs
 * the desk does, and every fetch in the app stays relative. See spec §2.
 */
const SRC = resolve(import.meta.dir, 'src');
const OUT = resolve(import.meta.dir, '../server/public');
const ENTRY = resolve(SRC, 'index.html');

const watchMode = process.argv.includes('--watch');
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';

async function build(): Promise<boolean> {
    const startedAt = performance.now();

    const result = await Bun.build({
        entrypoints: [ENTRY],
        outdir: OUT,
        target: 'browser',
        // Absolute, not relative: /p/:patientId is served the same index.html,
        // and a relative asset URL there would resolve to /p/chunk-….js.
        publicPath: '/',
        plugins: [tailwind],
        // React reads this to drop its development warnings and dev-only
        // bookkeeping; without it the bundle ships the development build.
        define: {
            'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
        },
        minify: production,
        sourcemap: production ? 'none' : 'linked',
        // Hash the chunks and assets for cache-busting, but never the HTML
        // entrypoint: static.ts serves `public/index.html` by that exact name,
        // and an `index-<hash>.html` makes every page a 503. Bun rewrites the
        // script/link hrefs inside the HTML to the hashed names either way.
        naming: production
            ? {
                  entry: '[dir]/[name].[ext]',
                  chunk: '[dir]/[name]-[hash].[ext]',
                  asset: '[dir]/[name]-[hash].[ext]',
              }
            : '[dir]/[name].[ext]',
    });

    if (!result.success) {
        for (const log of result.logs) console.error(log);
        console.error('✗ build failed');
        return false;
    }

    const ms = Math.round(performance.now() - startedAt);
    console.log(`✓ built ${result.outputs.length} files → packages/server/public (${ms}ms)`);
    return true;
}

await rm(OUT, { recursive: true, force: true });
const first = await build();

if (!watchMode) {
    process.exit(first ? 0 : 1);
}

console.log('watching src/ for changes…');
let building = false;
let pending = false;

watch(SRC, { recursive: true }, () => {
    if (building) {
        pending = true;
        return;
    }
    building = true;
    // Debounce — editors fire several events for a single save.
    setTimeout(async () => {
        await build();
        building = false;
        if (pending) {
            pending = false;
            await build();
        }
    }, 50);
});
