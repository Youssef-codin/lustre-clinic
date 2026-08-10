import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { Glob } from 'bun';

// `ui/` is the design system and it knows nothing about Mawid (Component
// Inventory §2). That is not a style preference — it is what makes the screen
// work parallelisable. Screens are built by separate agents against a frozen
// `ui/`, and the moment one of them can reach a domain type through a primitive,
// two screens can disagree about what a Button is and the freeze is gone.
//
// A `ui/` file may import from:
//   - `react` and `react-native`
//   - `../../theme`
//   - its own siblings (`./Button`)
//
// Anything else — `@mawid/shared`, `../domain`, `../../screens`, a tRPC client,
// a navigator — is a boundary violation. If a primitive needs to know that a
// visit has procedures, the component belongs in `domain/`.

const UI_ROOT = path.resolve(import.meta.dir);

const ALLOWED = [
    /^react$/,
    /^react\/.+/,
    /^react-native$/,
    /^\.\.\/\.\.\/theme$/,
    /^\.\/[\w.-]+$/, // siblings
];

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*'([^']+)'/g;

async function uiFiles(): Promise<string[]> {
    const glob = new Glob('*.{ts,tsx}');
    const files: string[] = [];
    for await (const file of glob.scan({ cwd: UI_ROOT })) {
        if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
        files.push(file);
    }
    return files;
}

describe('ui/ boundaries', () => {
    it('imports only react, react-native, the theme and its own siblings', async () => {
        const violations: string[] = [];

        for (const file of await uiFiles()) {
            const source = await Bun.file(path.join(UI_ROOT, file)).text();
            for (const match of source.matchAll(IMPORT)) {
                const specifier = match[1];
                if (specifier && !ALLOWED.some((allowed) => allowed.test(specifier))) {
                    violations.push(`${file}: ${specifier}`);
                }
            }
        }

        expect(violations).toEqual([]);
    });

    it('has a file for every component the barrel exports', async () => {
        const barrel = await Bun.file(path.join(UI_ROOT, 'index.ts')).text();
        const files = new Set(await uiFiles());
        const missing: string[] = [];

        for (const match of barrel.matchAll(/from '\.\/([\w.-]+)'/g)) {
            const name = match[1];
            if (!name) continue;
            if (!files.has(`${name}.ts`) && !files.has(`${name}.tsx`)) missing.push(name);
        }

        expect(missing).toEqual([]);
    });
});
