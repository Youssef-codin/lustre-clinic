import { MAX_DEVICE_LABEL, roleSchema } from '@lustre/shared';
import { z } from 'zod';

export const issueGrantInput = z.object({
    role: roleSchema,
    label: z.string().trim().min(1).max(MAX_DEVICE_LABEL),
});

/** The code out of the QR, not the QR's whole text: the phone strips the prefix (`grantCodeOf`). */
export const redeemGrantInput = z.object({ code: z.string().min(16).max(128) });

export const devRoleInput = z.object({ role: roleSchema });

export const revokeGrantInput = z.object({ grantId: z.uuid() });

export const setRequireProvisioningInput = z.object({ required: z.boolean() });

export type IssueGrantInput = z.infer<typeof issueGrantInput>;
