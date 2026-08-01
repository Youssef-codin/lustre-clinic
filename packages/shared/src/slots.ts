import { z } from 'zod';
import { type IsoDate, type IsoInstant, isoDateSchema, isoInstantSchema } from './time.ts';

/**
 * `GET /api/slots?date=&typeId=` → `SlotsResponse`
 *
 * Open slots for one day at one appointment type's duration. Both are required:
 * a 20-minute checkup and a 90-minute root canal see different gaps in the same
 * day, so there is no type-independent answer.
 */
export const slotsQuerySchema = z.object({
    date: isoDateSchema,
    typeId: z.string().min(1),
});

export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

export const openSlotSchema = z.object({
    startsAt: isoInstantSchema,
});

/**
 * An object rather than a bare start string so a later field — a break marker,
 * a "last one today" flag — is an addition and not a breaking change.
 */
export type OpenSlot = z.infer<typeof openSlotSchema>;

/**
 * `durationMin` sits on the envelope, not on every slot: it is constant for the
 * whole query. It is returned rather than left implicit in `typeId` so the
 * booking screen can render `10:00 – 10:20` without looking the type back up in
 * config — and so a config edit mid-session can't make the UI disagree with the
 * server about how long the slot it just offered actually is.
 */
export interface SlotsResponse {
    date: IsoDate;
    typeId: string;
    durationMin: number;
    /** In time order, clinic-local for that `date`, working hours only. */
    slots: OpenSlot[];
}

/** Convenience for rendering — the server never sends an `endsAt`. */
export function slotEndsAt(slot: OpenSlot, durationMin: number): IsoInstant {
    return new Date(new Date(slot.startsAt).getTime() + durationMin * 60_000).toISOString();
}
