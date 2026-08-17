// Display rules for the record's free-text columns. `gender` is a free string
// on the server (§5 does not enumerate it, so a clinic can write what it likes),
// which means the record holds whatever was typed — `female`, `Female`, `F`.
// Casing it here rather than on write keeps what the clinic entered intact and
// still shows one form on screen.

export function sentenceCase(value: string | null): string | null {
    if (!value) return null;
    return value.charAt(0).toUpperCase() + value.slice(1);
}
