import { existsSync, readFileSync } from 'node:fs';
import { Face, Font, Blob as HbBlob } from 'harfbuzzjs';
import fontPath from '../../../../assets/fonts/NotoNaskhArabic-Regular.ttf' with { type: 'file' };
import harfbuzzWasmPath from '../../../../assets/harfbuzz.wasm' with { type: 'file' };

/**
 * `harfbuzzjs` instantiates its WebAssembly module on import, reading
 * `harfbuzz.wasm` from a path relative to its own module — which inside a
 * compiled binary is `/$bunfs/root/harfbuzz.wasm`. Nothing puts it there unless
 * the build is told to, so a compiled binary dies on the first booking with
 * `ENOENT: /$bunfs/root/harfbuzz.wasm`.
 *
 * The import above embeds a vendored copy, and `--asset-naming="[name].[ext]"`
 * in the build script keeps the filename unhashed so it lands exactly where
 * harfbuzz looks. Both halves are required; dev never exercises either, which
 * is precisely the install-time failure spec §2 warns about.
 */

/**
 * One font for everything printed. Noto Naskh Arabic (SIL OFL, vendored under
 * `assets/fonts/`) covers Arabic, Latin and digits, so a slip mixing a patient's
 * Arabic name with an E.164 phone number needs no fallback and no font
 * selection logic.
 *
 * Vendored rather than taken from the OS: the clinic PC's font set is unknown
 * and a missing font would surface as blank glyphs on printed paper, which is
 * the one place nobody is watching. Imported with `type: 'file'` so it is
 * embedded by `bun build --compile` and resolves inside the binary.
 *
 * Still one face even though the documents now set some text bold, and that is
 * deliberate. Every weighted Noto Naskh Arabic face — Bold, SemiBold, Medium,
 * and the UI variants — ships Arabic and digits only: no Latin letters, and no
 * `+`, `-` or `/`. Embedding one would print a patient's phone as `□2010…`,
 * the ref as `150826□01`, and the entire English locale as boxes. The Regular
 * is the only face in the family with full coverage, so bold is stroked from
 * it instead — see `drawShapedText` in `text.ts`.
 */

let cached: { bytes: Uint8Array; face: Face; font: Font; upem: number } | null = null;

/**
 * Also the reason `harfbuzzWasmPath` is read rather than merely imported: an
 * import whose binding is never used is tree-shaken, the asset is never
 * emitted, and the binary fails at the first booking instead of at build time.
 */
export function assetsPresent(): boolean {
    return existsSync(fontPath) && existsSync(harfbuzzWasmPath);
}

export function getFont() {
    if (cached) return cached;

    if (!assetsPresent()) {
        throw new Error(`Print assets missing — expected ${fontPath} and ${harfbuzzWasmPath}`);
    }

    const bytes = new Uint8Array(readFileSync(fontPath));
    const face = new Face(new HbBlob(bytes), 0);
    const font = new Font(face);

    // Scaling to upem makes harfbuzz report advances in font units, which is
    // what the glyph-drawing code converts to points.
    font.setScale(face.upem, face.upem);

    cached = { bytes, face, font, upem: face.upem };
    return cached;
}
