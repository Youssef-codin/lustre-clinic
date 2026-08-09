import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { Glob } from 'bun';

// The stack lints with Biome, not ESLint, and neither Biome nor NativeWind has a
// rule for this. These two checks are the enforcement instead, and they run in
// `bun test` alongside everything else.
//
// 1. No arbitrary values. `bg-[#2f5bff]` is banned — if a value is not in
//    tailwind.config.js it does not exist. Adding a token is a deliberate edit to
//    the config, reviewed against the designs.
// 2. No physical directions. The app runs Arabic and English, so padding, margin
//    and insets are always logical (ps-/pe-/ms-/me-/start-/end-).

const APP_ROOT = path.resolve(import.meta.dir, '../..');

async function sourceFiles(): Promise<string[]> {
    const glob = new Glob('{App.tsx,src/**/*.{ts,tsx}}');
    const files: string[] = [];
    for await (const file of glob.scan({ cwd: APP_ROOT })) {
        if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
        files.push(file);
    }
    return files;
}

/** Class strings only — a hex in a comment or a native `style` prop is not our business. */
const CLASS_NAME = /className\s*=\s*(?:"([^"]*)"|{`([^`]*)`}|'([^']*)')/g;

const ARBITRARY = /(?:^|\s)[a-z-]+-\[[^\]]+\]/;
const PHYSICAL = /(?:^|\s)(?:-?(?:p|m)(?:l|r)-|(?:left|right)-|text-(?:left|right)\b|border-(?:l|r)-)/;

async function violations(rule: RegExp): Promise<string[]> {
    const found: string[] = [];
    for (const file of await sourceFiles()) {
        const source = await Bun.file(path.join(APP_ROOT, file)).text();
        for (const match of source.matchAll(CLASS_NAME)) {
            const classes = match[1] ?? match[2] ?? match[3] ?? '';
            if (rule.test(classes)) found.push(`${file}: ${classes.trim()}`);
        }
    }
    return found;
}

describe('design tokens', () => {
    it('no arbitrary values in className', async () => {
        expect(await violations(ARBITRARY)).toEqual([]);
    });

    it('no physical-direction utilities in className', async () => {
        expect(await violations(PHYSICAL)).toEqual([]);
    });
});
