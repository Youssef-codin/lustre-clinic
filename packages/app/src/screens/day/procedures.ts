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
import type { BookedProcedure } from './data';

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

export function groupByTooth(procedures: readonly PlannedProcedure[]): ToothGroup[] {
    const groups = new Map<string, PlannedProcedure[]>();
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
        .map(([tooth, items]) => ({
            tooth: (tooth || null) as Tooth | null,
            items,
            subtotal: totalOf(items),
        }));
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
