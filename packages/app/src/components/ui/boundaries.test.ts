// `ui/` is the design system and it knows nothing about Lustre (Component
// Inventory §2). That is what keeps screen work parallelisable: screens are built
// against a frozen `ui/`, and if a primitive could reach a domain type, two
// screens could disagree about what a Button is. A `ui/` file may import from
// `react`, `react-native`, `react-native-safe-area-context`, `../../theme` and
// its own siblings; anything else — `@lustre/shared`, `../domain`, a tRPC
// client, a navigator — is a boundary violation.
//
// `react-native-safe-area-context` is on that list for the same reason
// `react-native` is: it reports device chrome, carries no Lustre knowledge, and
// cannot couple a primitive to a domain type. `Sheet` needs the bottom inset to
// keep its own edge clear of the system navigation bar, the way
// `useKeyboardHeight` already covers the other edge.
//
// `@gorhom/bottom-sheet` is here on the same footing: it is the mechanics under
// `Sheet` — measurement, gesture and position — and knows nothing about Lustre.
// The look stays ours, drawn from the theme. A primitive built on it still
// cannot reach a domain type, which is the invariant this file exists to hold.
import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { Glob } from 'bun';

const UI_ROOT = path.resolve(import.meta.dir);

const ALLOWED = [
    /^react$/,
    /^react\/.+/,
    /^react-native$/,
    /^react-native-safe-area-context$/,
    /^@gorhom\/bottom-sheet$/,
    /^\.\.\/\.\.\/theme$/,
    /^\.\/[\w.-]+$/,
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
