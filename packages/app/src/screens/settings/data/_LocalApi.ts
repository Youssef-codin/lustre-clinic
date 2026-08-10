import { ERROR_CODE, type ErrorCode } from '@mawid/shared';
import type { Branch, ClinicDay, CustomQuestion, Procedure, ProcedureNode } from './types';

/**
 * The stand-in for the tRPC client.
 *
 * `packages/app` has no tRPC client and no TanStack Query — F2 in SPEC §18 has
 * not landed, and §10 forbids a screen agent inventing one, because four
 * clusters would then invent four. So this is `_Local` per the BLOCKED.md rule:
 * an in-memory store with the same procedure names, inputs and outputs as the
 * routers the settings screens will call, and the same rules enforced in the
 * same places.
 *
 *   settings.schedule / setDay / clearDay      branch.list / create / update
 *   procedure.tree / create / update           customQuestion.list / create / update
 *
 * Two things are deliberate rather than incidental:
 *
 * - **Everything is async, with a delay.** Every write in this app crosses
 *   Tailscale to a PC in the clinic, and the pending states are the point (see
 *   `ui/README.md`). A synchronous store would make every spinner untestable and
 *   every screen look correct on a machine where it never is.
 * - **Validation throws the codes the server throws.** The client localizes from
 *   `ERROR_CODE` and never parses a message (SPEC §4, §14), so the failures
 *   these screens have to render are the real ones: a duplicate question key, a
 *   category being priced, a default duration outside its list.
 *
 * Nothing here survives a reload. It is the shape of the data, not the data.
 */

/** An error the way the tRPC client will hand one over: a code, not a message. */
export class ApiError extends Error {
    constructor(
        readonly code: ErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/** Round trip to the clinic PC, roughly. Long enough that a spinner is visible. */
const LATENCY_MS = 420;

function settle<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

/** Ids are UUIDv7 on the server. Here they only have to be unique and stable. */
let sequence = 0;
function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}-${sequence}`;
}

// --- seed -------------------------------------------------------------------

const BRANCH_MAIN = 'branch-main';
const BRANCH_NEW_CAIRO = 'branch-new-cairo';

const branches: Branch[] = [
    { id: BRANCH_MAIN, name: 'Heliopolis', address: '12 Baghdad St, Korba', active: true },
    { id: BRANCH_NEW_CAIRO, name: 'New Cairo', address: '90th St, Fifth Settlement', active: true },
    { id: 'branch-maadi', name: 'Maadi', address: null, active: false },
];

/**
 * The tree the spec describes: a row with children is a category and is not
 * selectable; only leaves carry a price. Crown and Composite are categories,
 * Checkup and Extraction are childless roots and therefore selectable.
 */
const procedures: Procedure[] = [
    leaf('proc-checkup', null, 'Checkup', 30_000, { isCheckup: true, sortOrder: 0 }),
    leaf('proc-crown', null, 'Crown', 0, { sortOrder: 1 }),
    leaf('proc-crown-zirconia', 'proc-crown', 'Zirconia', 420_000, { toothSpecific: true, sortOrder: 0 }),
    leaf('proc-crown-emax', 'proc-crown', 'E.max', 480_000, { toothSpecific: true, sortOrder: 1 }),
    leaf('proc-composite', null, 'Composite filling', 0, { sortOrder: 2 }),
    leaf('proc-composite-i', 'proc-composite', 'Class I', 90_000, { toothSpecific: true, sortOrder: 0 }),
    leaf('proc-composite-ii', 'proc-composite', 'Class II', 110_000, { toothSpecific: true, sortOrder: 1 }),
    leaf('proc-composite-iii', 'proc-composite', 'Class III', 120_000, { toothSpecific: true, sortOrder: 2 }),
    leaf('proc-composite-iv', 'proc-composite', 'Class IV', 150_000, { toothSpecific: true, sortOrder: 3 }),
    leaf('proc-extraction', null, 'Extraction', 80_000, { toothSpecific: true, sortOrder: 3 }),
    leaf('proc-scaling', null, 'Scaling and polishing', 60_000, { sortOrder: 4, active: false }),
];

function leaf(
    id: string,
    parentId: string | null,
    name: string,
    defaultPrice: number,
    opts: {
        isCheckup?: boolean;
        hasQuantity?: boolean;
        toothSpecific?: boolean;
        sortOrder?: number;
        active?: boolean;
    } = {},
): Procedure {
    return {
        id,
        parentId,
        name,
        defaultPrice,
        hasQuantity: opts.hasQuantity ?? false,
        isToothSpecific: opts.toothSpecific ?? false,
        isCheckup: opts.isCheckup ?? false,
        active: opts.active ?? true,
        sortOrder: opts.sortOrder ?? 0,
    };
}

const questions: CustomQuestion[] = [
    {
        id: 'cq-diabetes',
        key: 'diabetic',
        label: 'Diabetic?',
        kind: 'boolean',
        options: null,
        required: true,
        sortOrder: 0,
        active: true,
    },
    {
        id: 'cq-blood',
        key: 'blood_thinners',
        label: 'هل تتناول مسيلات الدم؟',
        kind: 'boolean',
        options: null,
        required: true,
        sortOrder: 1,
        active: true,
    },
    {
        id: 'cq-referral',
        key: 'referral',
        label: 'How did you hear about us?',
        kind: 'select',
        options: ['Friend or family', 'Facebook', 'Instagram', 'Passing by', 'Another doctor'],
        required: false,
        sortOrder: 2,
        active: true,
    },
    {
        id: 'cq-allergies',
        key: 'allergies',
        label: 'Allergies',
        kind: 'text',
        options: null,
        required: false,
        sortOrder: 3,
        active: true,
    },
    {
        id: 'cq-last-xray',
        key: 'last_xray',
        label: 'Date of last x-ray',
        kind: 'date',
        options: null,
        required: false,
        sortOrder: 4,
        active: false,
    },
];

/** Sunday through Thursday. Friday and Saturday have no row, so they are closed. */
const schedule: ClinicDay[] = [
    { weekday: 0, branchId: BRANCH_MAIN, opensAt: '10:00', closesAt: '18:00' },
    { weekday: 1, branchId: BRANCH_MAIN, opensAt: '10:00', closesAt: '18:00' },
    { weekday: 2, branchId: BRANCH_NEW_CAIRO, opensAt: '12:00', closesAt: '20:00' },
    { weekday: 3, branchId: BRANCH_MAIN, opensAt: '10:00', closesAt: '18:00' },
    { weekday: 4, branchId: BRANCH_NEW_CAIRO, opensAt: '12:00', closesAt: '20:00' },
];

// --- inputs -----------------------------------------------------------------

export interface CreateBranchInput {
    name: string;
    address: string | null;
}

export interface UpdateBranchInput {
    id: string;
    name?: string;
    address?: string | null;
    active?: boolean;
}

export interface CreateProcedureInput {
    parentId: string | null;
    name: string;
    defaultPrice: number;
    hasQuantity: boolean;
    isToothSpecific: boolean;
    isCheckup: boolean;
}

export interface UpdateProcedureInput {
    id: string;
    parentId?: string | null;
    name?: string;
    defaultPrice?: number;
    hasQuantity?: boolean;
    isToothSpecific?: boolean;
    isCheckup?: boolean;
    active?: boolean;
}

export interface CreateQuestionInput {
    key: string;
    label: string;
    kind: CustomQuestion['kind'];
    options: string[] | null;
    required: boolean;
}

export interface UpdateQuestionInput {
    id: string;
    label?: string;
    options?: string[] | null;
    required?: boolean;
    active?: boolean;
}

export interface SetClinicDayInput {
    weekday: number;
    branchId: string;
    opensAt: string;
    closesAt: string;
}

// --- api --------------------------------------------------------------------

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export const api = {
    branch: {
        /** `includeInactive` — the settings list shows deactivated branches; pickers do not. */
        async list(includeInactive = false): Promise<Branch[]> {
            const rows = [...branches].sort((a, b) => a.name.localeCompare(b.name));
            return settle(includeInactive ? rows : rows.filter((b) => b.active));
        },

        async create(input: CreateBranchInput): Promise<Branch> {
            const row: Branch = {
                id: nextId('branch'),
                name: input.name.trim(),
                address: input.address?.trim() || null,
                active: true,
            };
            branches.push(row);
            return settle(row);
        },

        async update(input: UpdateBranchInput): Promise<Branch> {
            const row = branches.find((b) => b.id === input.id);
            if (!row) throw notFound('branch');

            if (input.name !== undefined) row.name = input.name.trim();
            if (input.address !== undefined) row.address = input.address?.trim() || null;
            if (input.active !== undefined) row.active = input.active;
            return settle({ ...row });
        },
    },

    procedure: {
        /** Categories with their leaves nested, exactly as `procedure.tree` returns them. */
        async tree(includeInactive = false): Promise<ProcedureNode[]> {
            const ordered = [...procedures].sort(bySortOrderThenName);
            const visible = includeInactive ? ordered : ordered.filter((p) => p.active);

            // Parenthood is computed over every row, active or not — the same
            // rule the service uses. Deriving it from the visible rows would
            // mark a category whose only subtype was deactivated as selectable.
            const parents = new Set(procedures.map((p) => p.parentId).filter(isString));

            const nodes = visible
                .filter((row) => row.parentId === null)
                .map((root) => ({
                    ...root,
                    children: visible.filter((p) => p.parentId === root.id),
                    selectable: !parents.has(root.id),
                }));

            return settle(nodes);
        },

        async create(input: CreateProcedureInput): Promise<Procedure> {
            if (input.parentId) assertUsableAsParent(input.parentId);

            const siblings = procedures.filter((p) => p.parentId === (input.parentId ?? null));
            const row: Procedure = {
                id: nextId('proc'),
                parentId: input.parentId ?? null,
                name: input.name.trim(),
                defaultPrice: input.defaultPrice,
                hasQuantity: input.hasQuantity,
                isToothSpecific: input.isToothSpecific,
                isCheckup: input.isCheckup,
                active: true,
                sortOrder: siblings.length,
            };
            procedures.push(row);
            return settle(row);
        },

        async update(input: UpdateProcedureInput): Promise<Procedure> {
            const row = procedures.find((p) => p.id === input.id);
            if (!row) throw notFound('procedure');

            if (input.parentId !== undefined && input.parentId !== null) {
                if (input.parentId === input.id) {
                    throw new ApiError(
                        ERROR_CODE.PROCEDURE_NESTING_TOO_DEEP,
                        'a procedure cannot be its own parent',
                    );
                }
                assertUsableAsParent(input.parentId);
                if (hasChildren(row.id)) {
                    throw new ApiError(
                        ERROR_CODE.PROCEDURE_NESTING_TOO_DEEP,
                        'a category with children cannot become a subtype',
                    );
                }
            }

            if (input.parentId !== undefined) row.parentId = input.parentId ?? null;
            if (input.name !== undefined) row.name = input.name.trim();
            if (input.defaultPrice !== undefined) row.defaultPrice = input.defaultPrice;
            if (input.hasQuantity !== undefined) row.hasQuantity = input.hasQuantity;
            if (input.isToothSpecific !== undefined) row.isToothSpecific = input.isToothSpecific;
            if (input.isCheckup !== undefined) row.isCheckup = input.isCheckup;
            if (input.active !== undefined) row.active = input.active;

            // Only one procedure holds the checkup flag — the waiver in §9 is
            // written against "the" checkup line, singular.
            if (input.isCheckup) {
                for (const other of procedures) {
                    if (other.id !== row.id) other.isCheckup = false;
                }
            }

            return settle({ ...row });
        },

        /**
         * Applies an order to a set of siblings. The server has no bulk endpoint
         * — this is N `procedure.update` calls with a `sortOrder` each, done in
         * one round trip here so the list does not reorder itself row by row in
         * front of the user. See BLOCKED.md.
         */
        async reorder(ids: readonly string[]): Promise<void> {
            ids.forEach((id, index) => {
                const row = procedures.find((p) => p.id === id);
                if (row) row.sortOrder = index;
            });
            return settle(undefined);
        },
    },

    customQuestion: {
        async list(includeInactive = false): Promise<CustomQuestion[]> {
            const rows = [...questions].sort(
                (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
            );
            return settle(includeInactive ? rows : rows.filter((q) => q.active));
        },

        async create(input: CreateQuestionInput): Promise<CustomQuestion> {
            const key = input.key.trim();
            if (!KEY_PATTERN.test(key)) {
                throw new ApiError(ERROR_CODE.VALIDATION, 'key must be lower_snake_case');
            }
            if (questions.some((q) => q.key === key)) {
                throw new ApiError(ERROR_CODE.DUPLICATE_KEY, 'that question key is already in use');
            }
            if (input.kind === 'select' && (input.options?.length ?? 0) < 1) {
                throw new ApiError(ERROR_CODE.VALIDATION, 'a select question needs options');
            }

            const row: CustomQuestion = {
                id: nextId('cq'),
                key,
                label: input.label.trim(),
                kind: input.kind,
                options: input.kind === 'select' ? (input.options ?? []) : null,
                required: input.required,
                sortOrder: questions.length,
                active: true,
            };
            questions.push(row);
            return settle(row);
        },

        async update(input: UpdateQuestionInput): Promise<CustomQuestion> {
            const row = questions.find((q) => q.id === input.id);
            if (!row) throw notFound('custom question');

            if (input.label !== undefined) row.label = input.label.trim();
            if (input.required !== undefined) row.required = input.required;
            if (input.active !== undefined) row.active = input.active;
            if (input.options !== undefined && row.kind === 'select') {
                if ((input.options?.length ?? 0) < 1) {
                    throw new ApiError(ERROR_CODE.VALIDATION, 'a select question needs options');
                }
                row.options = input.options;
            }

            return settle({ ...row });
        },

        async reorder(ids: readonly string[]): Promise<void> {
            ids.forEach((id, index) => {
                const row = questions.find((q) => q.id === id);
                if (row) row.sortOrder = index;
            });
            return settle(undefined);
        },
    },

    settings: {
        /** Every open weekday, ascending. A missing weekday is closed. */
        async schedule(): Promise<ClinicDay[]> {
            return settle([...schedule].sort((a, b) => a.weekday - b.weekday));
        },

        async setDay(input: SetClinicDayInput): Promise<ClinicDay> {
            if (!branches.some((b) => b.id === input.branchId)) throw notFound('branch');
            // Both are zero-padded `HH:MM`, so comparing them as strings orders
            // them by time.
            if (!(input.opensAt < input.closesAt)) {
                throw new ApiError(ERROR_CODE.VALIDATION, 'opensAt must be before closesAt');
            }

            const existing = schedule.find((d) => d.weekday === input.weekday);
            if (existing) Object.assign(existing, input);
            else schedule.push({ ...input });

            return settle({ ...input });
        },

        /** Closing a closed day is a no-op, the same as the service. */
        async clearDay(weekday: number): Promise<void> {
            const index = schedule.findIndex((d) => d.weekday === weekday);
            if (index >= 0) schedule.splice(index, 1);
            return settle(undefined);
        },
    },
};

function bySortOrderThenName(a: Procedure, b: Procedure): number {
    return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

function isString(value: string | null): value is string {
    return value !== null;
}

function hasChildren(id: string): boolean {
    return procedures.some((p) => p.parentId === id);
}

/** A parent must itself be a root, or the tree would be three levels deep. */
function assertUsableAsParent(parentId: string): void {
    const parent = procedures.find((p) => p.id === parentId);
    if (!parent) throw notFound('procedure');
    if (parent.parentId !== null) {
        throw new ApiError(ERROR_CODE.PROCEDURE_NESTING_TOO_DEEP, 'a subtype may not have children');
    }
}

function notFound(what: string): ApiError {
    return new ApiError(ERROR_CODE.NOT_FOUND, `${what} not found`);
}
