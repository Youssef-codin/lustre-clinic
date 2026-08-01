import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * `bun build --compile` embeds sources under a virtual filesystem, so
 * `import.meta.dir` no longer points anywhere on disk. Anything the clinic can
 * edit — config.json, the built frontend, the session folder — has to be
 * resolved against the executable instead. See spec §2.
 */
export const isCompiled = import.meta.path.includes('$bunfs') || import.meta.path.includes('~BUN');

/** Directory the app treats as its install root: next to the exe, or the package root in dev. */
export const appRoot = isCompiled ? dirname(process.execPath) : resolve(import.meta.dir, '..', '..');

/** Resolve a config-supplied path (which may be relative) against the install root. */
export function fromAppRoot(...segments: string[]): string {
    const joined = resolve(appRoot, ...segments);
    return joined;
}

export function resolveConfigured(path: string): string {
    return isAbsolute(path) ? path : fromAppRoot(path);
}
