/**
 * What is going to be done, as the booking holds it before anything is written.
 * A visit's procedures are lines with a tooth and a price (§5, §9), and a
 * booking is a plan for exactly those lines — so the draft is shaped like them,
 * and `bookedProcedures` hands the whole list to the appointment, which carries
 * one of its own (it once carried a single `typeId`, and the rest of the plan
 * had to ride along in the note).
 *
 * Grouping is by tooth, not by procedure, because that is how the work is
 * spoken about at the desk and in the chair: "UL6 needs a filling and a
 * cleaning" is one tooth with two lines, and a flat list makes the reader
 * gather them. Lines with no tooth are one group and always sort last — a
 * scaling belongs to the mouth, not to a number.
 *
 * Money is integer piastres end to end (§7.12); nothing here formats it.
 */
import { DECIDUOUS_TEETH, PERMANENT_TEETH, type Tooth } from '@lustre/shared';
import type { BookedProcedure, ProcedureCategory } from './data';

export interface PlannedProcedure {
    /** Local to the draft — the row does not exist server-side yet. */
    id: string;
    procedureId: string;
    /** The category as it is read out: "Composite filling". */
    name: string;
    /** The variant under it, when the procedure has one: "Class II". */
    variant: string | null;
    tooth: Tooth | null;
    price: number;
}

export interface ToothGroup {
    tooth: Tooth | null;
    items: PlannedProcedure[];
    subtotal: number;
}

const QUADRANT_WORDS: Record<string, string> = {
    UR: 'Upper right',
    UL: 'Upper left',
    LL: 'Lower left',
    LR: 'Lower right',
};

export interface Quadrant {
    key: string;
    name: string;
    /** Permanent teeth first, then the child's tooth in the same quadrant. */
    codes: Tooth[];
}

/**
 * The chart as it is drawn: upper right runs 8→1 towards the midline, upper
 * left 1→8 away from it, and the lower row mirrors that, so the grid reads
 * like a mouth facing the reader rather than like a sorted list.
 */
export const QUADRANTS: Quadrant[] = ['UR', 'UL', 'LL', 'LR'].map((key) => {
    const permanent = PERMANENT_TEETH.filter((code) => code.startsWith(key));
    const deciduous = DECIDUOUS_TEETH.filter((code) => code.startsWith(key));
    const ordered = key === 'UR' || key === 'LR' ? [...permanent].reverse() : permanent;

    return {
        key,
        name: `${QUADRANT_WORDS[key]} · ${key}`,
        codes: [...ordered, ...deciduous] as Tooth[],
    };
});

const TOOTH_ORDER = new Map<string, number>(
    QUADRANTS.flatMap((quadrant, index) =>
        quadrant.codes.map((code, at) => [code, index * 100 + at] as const),
    ),
);

/** "Upper left · 6" — what the badge cannot fit, said in words. */
export function toothPosition(tooth: Tooth | null): string {
    if (!tooth) return 'No tooth assigned';
    return `${QUADRANT_WORDS[tooth.slice(0, 2)] ?? ''} · ${tooth.slice(2)}`;
}

/**
 * The grouping on its own, for lines that carry no price. A booked appointment
 * holds the plan that was agreed, not a bill — the visit snapshots the
 * catalogue on the day — so anything reading a booking has teeth and names and
 * nothing to subtotal, and asking it to invent a price to be grouped would put
 * a number on screen the clinic never quoted.
 */
export function toothGroupsOf<T extends { tooth: Tooth | null }>(
    procedures: readonly T[],
): Array<{ tooth: Tooth | null; items: T[] }> {
    const groups = new Map<string, T[]>();
    for (const procedure of procedures) {
        const key = procedure.tooth ?? '';
        groups.set(key, [...(groups.get(key) ?? []), procedure]);
    }

    return [...groups.entries()]
        .sort(([a], [b]) => {
            if (a === '') return 1;
            if (b === '') return -1;
            return (TOOTH_ORDER.get(a) ?? 0) - (TOOTH_ORDER.get(b) ?? 0);
        })
        .map(([tooth, items]) => ({ tooth: (tooth || null) as Tooth | null, items }));
}

export function groupByTooth(procedures: readonly PlannedProcedure[]): ToothGroup[] {
    return toothGroupsOf(procedures).map((group) => ({ ...group, subtotal: totalOf(group.items) }));
}

export function totalOf(procedures: readonly PlannedProcedure[]): number {
    return procedures.reduce((sum, procedure) => sum + procedure.price, 0);
}

/**
 * The plan as the booking sends it (§7). One line out per line in, never merged
 * into a quantity: two fillings on two teeth are two lines with two teeth, and
 * two on the same tooth are still two things that were agreed to and will be
 * priced one by one at check-in. Price does not go — the visit snapshots the
 * catalogue's on the day.
 */
export function bookedProcedures(plan: readonly PlannedProcedure[]): BookedProcedure[] {
    return plan.map((procedure) => ({ procedureId: procedure.procedureId, tooth: procedure.tooth }));
}

/** How a line reads in one string — the confirm step and the note both want it. */
export function describeProcedure(procedure: PlannedProcedure): string {
    const label = procedure.variant ? `${procedure.name} · ${procedure.variant}` : procedure.name;
    return procedure.tooth ? `${label} (${procedure.tooth})` : label;
}

/**
 * Only what can actually go where the secretary is putting it. A tooth was
 * chosen, so the list is the procedures done *to* a tooth; "no tooth assigned"
 * is the list of those done to the mouth. The server refuses the other pairing
 * either way (§5 — TOOTH_REQUIRED, TOOTH_NOT_APPLICABLE), so offering it here
 * only holds the refusal back until confirm, with the whole plan already built
 * and the patient waiting on it.
 *
 * A heading keeps only the variants that fit, and a heading with none left is
 * not a heading worth opening.
 */
export function offeredFor(categories: readonly ProcedureCategory[], hasTooth: boolean): ProcedureCategory[] {
    return categories.flatMap((category) => {
        if (category.selectable) {
            return category.isToothSpecific === hasTooth ? [category] : [];
        }

        const children = category.children.filter((child) => child.isToothSpecific === hasTooth);
        return children.length > 0 ? [{ ...category, children }] : [];
    });
}

/**
 * The line check-in seeds on top of the booking's plan (§9): the clinic's
 * checkup, waived when the plan already names one. `visit.checkIn` is the
 * authority — this mirrors its choice so the arrival screen can show the line
 * before a visit exists to carry it, which otherwise left a booking with no
 * plan drawing an empty screen that read as broken. Picked the way the server
 * picks it: the first active checkup in catalogue order.
 */
export function checkupToAdd(
    categories: readonly ProcedureCategory[],
    planned: readonly { procedureId: string }[],
): { procedureId: string; name: string; price: number } | null {
    const checkups = new Set<string>();
    let first: { procedureId: string; name: string; price: number } | null = null;

    for (const category of categories) {
        for (const row of category.selectable ? [category] : category.children) {
            if (!row.isCheckup) continue;
            checkups.add(row.id);
            first ??= { procedureId: row.id, name: row.name, price: row.defaultPrice };
        }
    }

    if (!first) return null;
    return planned.some((line) => checkups.has(line.procedureId)) ? null : first;
}
