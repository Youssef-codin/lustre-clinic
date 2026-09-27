/**
 * `server/src/modules/device/device.service.ts`, over the arrays in `../db`.
 * Who is asking arrives as the `caller` the link resolved from this phone's
 * demo credential, the way the server resolves it from the request header.
 */
import { ERROR_CODE, GRANT_TTL_MINUTES, grantPayload, type Role, WS_EVENT } from '@lustre/shared';
import type { RouterInput, RouterOutput } from '../../types';
import { type DeviceRow, getDb, type RoleGrantRow, save } from '../db';
import { broadcast } from '../events';
import { DemoError, uuidv7 } from '../rules';
import type { Dated } from '../wire';

export interface DemoCaller {
    token: string | null;
    deviceId: string | null;
    role: Role | null;
}

type GrantStatus = Dated<RouterOutput['device']['grants'][number]>['status'];

function statusOf(row: RoleGrantRow, now: Date, deviceRetired = false): GrantStatus {
    if (row.revokedAt) return 'revoked';
    if (row.redeemedAt) return deviceRetired ? 'replaced' : 'redeemed';
    if (row.expiresAt <= now) return 'expired';
    return 'pending';
}

function liveDevice(token: string | null): DeviceRow | null {
    if (token === null) return null;
    const device = getDb().devices.find((row) => row.token === token);
    return device && !device.revokedAt ? device : null;
}

/** `deviceService.authorize`: the caller behind a token, or the refusal the server would send. */
export function authorizeDemo(token: string | null): DemoCaller {
    if (token === null) {
        if (getDb().settings.requireProvisioning) {
            throw new DemoError(ERROR_CODE.DEVICE_NOT_PROVISIONED, 'this phone has no role', 401);
        }
        return { token, deviceId: null, role: null };
    }
    const device = liveDevice(token);
    if (!device) throw new DemoError(ERROR_CODE.DEVICE_REVOKED, 'credential revoked or unknown', 401);
    return { token, deviceId: device.id, role: device.role };
}

function issue(role: Role, label: string, issuedBy: string | null) {
    const code = uuidv7();
    const row: RoleGrantRow = {
        id: uuidv7(),
        role,
        label,
        code,
        issuedBy,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + GRANT_TTL_MINUTES * 60_000),
        redeemedAt: null,
        revokedAt: null,
    };
    getDb().roleGrants.push(row);
    save();
    broadcast(WS_EVENT.DEVICES_UPDATED);
    return { row, code };
}

/** `previous`: the credential the phone had, which a new code retires (`deviceService.redeem`). */
function redeem(code: string, previous: string | null = null) {
    const db = getDb();
    const now = new Date();
    const grant = db.roleGrants.find((row) => row.code === code);
    const status = grant ? statusOf(grant, now) : null;
    if (!grant || status === null) throw new DemoError(ERROR_CODE.GRANT_INVALID, 'no such grant', 404);
    if (status === 'redeemed') throw new DemoError(ERROR_CODE.GRANT_USED, 'grant already redeemed', 409);
    if (status === 'revoked') throw new DemoError(ERROR_CODE.GRANT_REVOKED, 'grant revoked', 422);
    if (status === 'expired') throw new DemoError(ERROR_CODE.GRANT_EXPIRED, 'grant expired', 422);

    grant.redeemedAt = now;
    const device: DeviceRow = {
        id: uuidv7(),
        grantId: grant.id,
        role: grant.role,
        label: grant.label,
        token: uuidv7(),
        createdAt: now,
        revokedAt: null,
    };
    for (const old of db.devices) if (previous !== null && old.token === previous) old.revokedAt ??= now;
    db.devices.push(device);
    save();
    broadcast(WS_EVENT.DEVICES_UPDATED);
    return { token: device.token, deviceId: device.id, role: device.role, label: device.label };
}

/**
 * The demo's stand-in for being handed a code: there is no second phone to
 * scan this one's screen, so the code is issued and redeemed in one step. The
 * rules after it are the same — the role lives on a device row, and the link
 * reads it back from the token on every request.
 */
export function provisionDemo(role: Role, previous: string | null): ReturnType<typeof redeem> {
    const { code } = issue(role, `Demo ${role}`, null);
    return redeem(code, previous);
}

export const deviceHandlers = {
    me(_input: undefined, caller: DemoCaller): Dated<RouterOutput['device']['me']> {
        const device = liveDevice(caller.token);
        return device ? { deviceId: device.id, role: device.role, label: device.label } : null;
    },

    redeem(
        input: RouterInput['device']['redeem'],
        caller: DemoCaller,
    ): Dated<RouterOutput['device']['redeem']> {
        return redeem(input.code, caller.token);
    },

    grants(): Dated<RouterOutput['device']['grants']> {
        const db = getDb();
        const now = new Date();
        return [...db.roleGrants]
            .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
            .map((row) => {
                const device = db.devices.find((candidate) => candidate.grantId === row.id);
                return {
                    id: row.id,
                    role: row.role,
                    label: row.label,
                    status: statusOf(row, now, device?.revokedAt !== null && device !== undefined),
                    issuedBy: row.issuedBy,
                    issuedAt: row.issuedAt,
                    expiresAt: row.expiresAt,
                    redeemedAt: row.redeemedAt,
                    revokedAt: row.revokedAt,
                    deviceId: device?.id ?? null,
                };
            });
    },

    issue(input: RouterInput['device']['issue'], caller: DemoCaller): Dated<RouterOutput['device']['issue']> {
        const { row, code } = issue(input.role, input.label.trim(), caller.deviceId);
        return {
            id: row.id,
            role: row.role,
            label: row.label,
            expiresAt: row.expiresAt,
            payload: grantPayload(code),
        };
    },

    revoke(input: RouterInput['device']['revoke'], caller: DemoCaller): void {
        const db = getDb();
        const grant = db.roleGrants.find((row) => row.id === input.grantId);
        if (!grant) throw DemoError.notFound('grant');
        const device = db.devices.find((row) => row.grantId === grant.id);
        if (device && device.id === caller.deviceId) {
            throw new DemoError(ERROR_CODE.ROLE_FORBIDDEN, 'this role may not revoke its own role', 403);
        }
        const now = new Date();
        grant.revokedAt ??= now;
        if (device) device.revokedAt ??= now;
        save();
        broadcast(WS_EVENT.DEVICES_UPDATED);
    },
};
