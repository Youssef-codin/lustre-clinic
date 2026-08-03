import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * SPEC §16 — encrypt before off-site upload. The key is not stored on the
 * clinic machine, so a dump sitting in object storage is useless on its own.
 *
 * AES-256-GCM, from the platform's own crypto. Chosen over age/libsodium
 * because it needs no dependency and no key-management format: the operator
 * holds 32 bytes, and `scripts/backup-decrypt.ts` turns a file back into a
 * dump with them.
 *
 * Layout: MAGIC (6) ‖ IV (12) ‖ ciphertext ‖ tag (16).
 */

const MAGIC = Buffer.from('MAWID1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Accepts the key as hex or base64. Either way it must decode to 32 bytes. */
export function parseKey(raw: string): Buffer {
    const trimmed = raw.trim();

    const candidates = /^[0-9a-fA-F]+$/.test(trimmed)
        ? [Buffer.from(trimmed, 'hex'), Buffer.from(trimmed, 'base64')]
        : [Buffer.from(trimmed, 'base64')];

    const key = candidates.find((b) => b.length === KEY_BYTES);
    if (!key) {
        throw new Error(`BACKUP_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (hex or base64)`);
    }
    return key;
}

export function encrypt(plaintext: Uint8Array, key: Buffer): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]);
}

export function decrypt(envelope: Uint8Array, key: Buffer): Buffer {
    const buf = Buffer.from(envelope);

    if (buf.length < MAGIC.length + IV_BYTES + TAG_BYTES || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
        throw new Error('not a mawid backup envelope');
    }

    const iv = buf.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
    const tag = buf.subarray(buf.length - TAG_BYTES);
    const body = buf.subarray(MAGIC.length + IV_BYTES, buf.length - TAG_BYTES);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    // Throws if the ciphertext or the tag has been tampered with.
    return Buffer.concat([decipher.update(body), decipher.final()]);
}

/** Convenience for the operator: `bun -e 'console.log(generateKey())'`. */
export function generateKey(): string {
    return randomBytes(KEY_BYTES).toString('base64');
}
