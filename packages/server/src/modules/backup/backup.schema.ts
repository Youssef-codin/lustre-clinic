import { z } from 'zod';

/**
 * The phone ran the consent step and is handing back what the token exchange
 * needs. Deliberately not the refresh token: the code is single-use and useless
 * without the verifier, so the credential itself goes Google → server and never
 * sits on a handset (§16).
 */
export const linkDriveInput = z.object({
    code: z.string().min(1).max(2048),
    codeVerifier: z.string().min(43).max(128),
    account: z.string().max(320).optional(),
});
