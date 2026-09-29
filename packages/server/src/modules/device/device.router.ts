/**
 * `redeem` and `me` are public: they are how a phone with no role gets one, and
 * how a phone finds out its credential was revoked. `devRole` is public too, and
 * refused by any server that is not a development one. Everything else is the
 * admin's.
 */
import { adminProcedure, publicProcedure, router } from '../../trpc/init.ts';
import {
    devRoleInput,
    issueGrantInput,
    redeemGrantInput,
    revokeGrantInput,
    setRequireProvisioningInput,
} from './device.schema.ts';
import { deviceService } from './device.service.ts';

export const deviceRouter = router({
    me: publicProcedure.query(({ ctx }) => deviceService.me(ctx.token)),

    redeem: publicProcedure
        .input(redeemGrantInput)
        .mutation(({ input, ctx }) => deviceService.redeem(input.code, ctx.token)),

    devRole: publicProcedure
        .input(devRoleInput)
        .mutation(({ input, ctx }) => deviceService.devRole(input.role, ctx.token)),

    grants: adminProcedure.query(() => deviceService.grants()),

    issue: adminProcedure
        .input(issueGrantInput)
        .mutation(({ input, ctx }) => deviceService.issue(input, ctx.caller.deviceId)),

    revoke: adminProcedure
        .input(revokeGrantInput)
        .mutation(({ input, ctx }) => deviceService.revoke(input.grantId, ctx.caller)),

    setRequireProvisioning: adminProcedure
        .input(setRequireProvisioningInput)
        .mutation(({ input, ctx }) => deviceService.setRequireProvisioning(input.required, ctx.caller)),
});
