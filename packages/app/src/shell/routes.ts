// The two things the shell has to do that no cluster can do for itself, kept
// here as data so they can be tested — `bun test` has no renderer, so anything
// that only exists inside a component is verified on a device.
//
// **Pushing a route another cluster owns.** The record screen's Book, Walk-in
// and Record payment all land in the day or money cluster, and a cluster holds
// its own stack, so the ask has to go up to the shell and back down. It travels
// as a *request*, not a route: the destination decides which of its screens
// that means. `seq` is what makes one ask distinguishable from the next, so the
// same destination can be asked for twice — the pattern `PatientsCluster`
// already reads its record request with.
//
// **Going home.** Tapping the tab you are already on pops that cluster back to
// its root. The shell cannot pop a cluster from outside — it does not own the
// routes inside one — so it bumps a counter per tab and each cluster resets
// itself when its number changes, deciding for itself what home means.
import type { TabKey } from '../components/domain';

/** A cross-cluster request: what the destination needs, plus which ask it is. */
export type Ask<T> = T & { seq: number };

/** The next ask after `current`, whatever `current` was for. */
export function ask<T>(current: Ask<unknown> | undefined, next: T): Ask<T> {
    return { ...next, seq: (current?.seq ?? 0) + 1 };
}

/** Whether a request is one the cluster has not acted on yet. */
export function isUnseen(request: Ask<unknown> | undefined, seen: number): boolean {
    return request !== undefined && request.seq !== seen;
}

/** One counter per tab. A cluster sees its own number change and resets. */
export type HomeSignals = Record<TabKey, number>;

export const NO_HOME: HomeSignals = { day: 0, patients: 0, money: 0, settings: 0 };

export function bumpHome(current: HomeSignals, tab: TabKey): HomeSignals {
    return { ...current, [tab]: current[tab] + 1 };
}

/**
 * Who a cross-cluster push is about. Every destination needs the patient named
 * rather than just identified — the booking page prints the name and number
 * back at the desk, and the money cluster's patient route carries the name
 * because `visit.balances` does not return it.
 */
export type PatientTarget = {
    id: string;
    name: string;
    phone: string;
};

/** Book for a day yet to be chosen, or seat them now. */
export type BookingTiming = 'now' | 'later';
