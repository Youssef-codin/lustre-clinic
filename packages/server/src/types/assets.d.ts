/**
 * Fonts are imported with `type: 'file'` so `bun build --compile` embeds them
 * and the path resolves inside the binary. Bun resolves these; TypeScript needs
 * telling, the same way `sql.d.ts` covers embedded migrations.
 */
declare module '*.ttf' {
    const path: string;
    export default path;
}

declare module '*.wasm' {
    const path: string;
    export default path;
}

/**
 * `bidi-js` ships no types. Only the two calls this codebase makes are
 * declared — a full ambient `any` would hide a real mistake in the bidi path,
 * which is precisely where Arabic goes wrong silently.
 */
declare module 'bidi-js' {
    interface BidiApi {
        getEmbeddingLevels: (
            text: string,
            baseDirection?: 'ltr' | 'rtl' | 'auto',
        ) => { levels: Uint8Array; paragraphs: { start: number; end: number; level: number }[] };
        getReorderSegments: (
            text: string,
            embeddingLevels: { levels: Uint8Array },
            start?: number,
            end?: number,
        ) => [number, number][];
    }

    export default function bidiFactory(): BidiApi;
}
