/**
 * The demo's database: the tables of `server/src/db/schema.ts`, as arrays.
 *
 * Row shapes are the schema's, not the wire's — timestamps are `Date`, money is
 * integer piastres, and `custom` is an object — so the handlers in `./handlers`
 * read like the services they mirror. Turning that into what the wire carries
 * is the link's job, in one place (`./link`), which is also what keeps the ISO
 * strings the screens already parse coming out of demo mode unchanged.
 *
 * Persisted to AsyncStorage so an appointment booked on stage survives a reload
 * (`save`). JSON has no date type, so every timestamp column is named in
 * `revive` rather than sniffed for: a generic "looks like an ISO string"
 * reviver would eventually turn a patient's answer to a date question — which
 * is a `YYYY-MM-DD` string on purpose, not an instant — into a `Date`.
 */

import type {
    AppointmentChannel,
    AppointmentStatus,
    PaymentMethod,
    QuestionKind,
    ReminderStatus,
    Tooth,
} from '@lustre/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BranchRow {
    id: string;
    name: string;
    address: string | null;
    active: boolean;
}

export interface ClinicDayRow {
    weekday: number;
    branchId: string;
    opensAt: string;
    closesAt: string;
}

export interface PatientRow {
    id: string;
    ref: string;
    name: string;
    phone: string;
    email: string | null;
    birthDate: string | null;
    gender: string | null;
    custom: Record<string, unknown>;
    notes: string | null;
    legacyRef: string | null;
    createdAt: Date;
}

export interface ProcedureTypeRow {
    id: string;
    parentId: string | null;
    name: string;
    defaultPrice: number;
    hasQuantity: boolean;
    isToothSpecific: boolean;
    isCheckup: boolean;
    active: boolean;
    sortOrder: number;
}

export interface AppointmentRow {
    id: string;
    ref: string;
    patientId: string;
    branchId: string;
    startsAt: Date;
    durationMinutes: number;
    note: string | null;
    status: AppointmentStatus;
    channel: AppointmentChannel;
    isOpeningBalance: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface AppointmentProcedureRow {
    id: string;
    appointmentId: string;
    procedureId: string;
    quantity: number;
    tooth: Tooth | null;
    note: string | null;
    sortOrder: number;
}

export interface VisitRow {
    id: string;
    appointmentId: string;
    checkedInAt: Date;
    inChairAt: Date | null;
    pricedAt: Date | null;
    completedAt: Date | null;
    computedTotal: number;
    chargedTotal: number;
    createdAt: Date;
}

export interface VisitProcedureRow {
    id: string;
    visitId: string;
    procedureId: string;
    quantity: number;
    unitPrice: number;
    tooth: Tooth | null;
    note: string | null;
}

export interface PaymentRow {
    id: string;
    visitId: string;
    amount: number;
    method: PaymentMethod;
    methodNote: string | null;
    paidAt: Date;
}

export interface CustomQuestionRow {
    id: string;
    key: string;
    label: string;
    labelAr: string | null;
    kind: QuestionKind;
    options: unknown;
    required: boolean;
    sortOrder: number;
    active: boolean;
}

export interface ReminderRow {
    id: string;
    appointmentId: string;
    dueAt: Date;
    status: ReminderStatus;
    sentAt: Date | null;
}

export interface SettingsRow {
    clinicName: string;
    clinicPhone: string | null;
    durationOptions: number[];
    defaultDuration: number;
    reminderLeadHours: number;
    reminderNotifyAt: string;
    reminderRepeatMinutes: number;
    reminderDismissedOn: string | null;
    reminderTemplate: string;
    updatedAt: Date;
}

export interface DemoDb {
    branches: BranchRow[];
    clinicDays: ClinicDayRow[];
    patients: PatientRow[];
    procedureTypes: ProcedureTypeRow[];
    appointments: AppointmentRow[];
    appointmentProcedures: AppointmentProcedureRow[];
    visits: VisitRow[];
    visitProcedures: VisitProcedureRow[];
    payments: PaymentRow[];
    customQuestions: CustomQuestionRow[];
    reminders: ReminderRow[];
    settings: SettingsRow;
}

const STORE_KEY = 'lustre.demo.db';

/**
 * Bumped when a row shape changes, or when the seed itself does in a way that
 * makes an already-stored clinic wrong. A stored database from an older build is
 * dropped and reseeded rather than migrated — this is demo data, and half a
 * schema is a worse demo than a fresh one.
 *
 * 2: the week used to be split across both branches, which put today's clinic
 *    day at Zamalek while the day view opens on Maadi — a demo that started on
 *    "Closed on Tuesdays". A phone that already stored that database has to drop
 *    it, or the fix does not reach it.
 */
const STORE_VERSION = 2;

let db: DemoDb | null = null;

export function getDb(): DemoDb {
    if (!db) throw new Error('the demo database has not been opened');
    return db;
}

export function setDb(next: DemoDb): void {
    db = next;
}

export function isOpen(): boolean {
    return db !== null;
}

/**
 * Writes are collapsed: a checkout is several table writes in a row and the
 * screen is waiting on none of them, so the whole database is serialized once
 * the burst is over rather than once per table.
 */
let pending: ReturnType<typeof setTimeout> | null = null;

export function save(): void {
    if (pending) return;
    pending = setTimeout(() => {
        pending = null;
        const current = db;
        if (!current) return;
        void AsyncStorage.setItem(STORE_KEY, JSON.stringify({ version: STORE_VERSION, db: current })).catch(
            () => undefined,
        );
    }, 250);
}

export async function clearStored(): Promise<void> {
    await AsyncStorage.removeItem(STORE_KEY).catch(() => undefined);
}

/** Every timestamp column, by table. Anything not named here stays as JSON left it. */
const DATE_FIELDS = {
    patients: ['createdAt'],
    appointments: ['startsAt', 'createdAt', 'updatedAt'],
    visits: ['checkedInAt', 'inChairAt', 'pricedAt', 'completedAt', 'createdAt'],
    payments: ['paidAt'],
    reminders: ['dueAt', 'sentAt'],
} as const satisfies Partial<Record<keyof DemoDb, readonly string[]>>;

function reviveRows(rows: unknown, fields: readonly string[]): void {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const record = row as Record<string, unknown>;
        for (const field of fields) {
            const value = record[field];
            if (typeof value === 'string') record[field] = new Date(value);
        }
    }
}

function revive(parsed: DemoDb): DemoDb {
    for (const [table, fields] of Object.entries(DATE_FIELDS)) {
        reviveRows(parsed[table as keyof DemoDb], fields);
    }
    if (typeof parsed.settings?.updatedAt === 'string') {
        parsed.settings.updatedAt = new Date(parsed.settings.updatedAt);
    }
    return parsed;
}

/**
 * A stored database, or nothing. Malformed JSON and an older version both mean
 * "seed a new one" — the caller has a seeder and no use for a partial answer,
 * which is the one case the guide's no-`try` rule makes room for.
 */
export async function loadStored(): Promise<DemoDb | null> {
    const raw = await AsyncStorage.getItem(STORE_KEY).catch(() => null);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as { version?: number; db?: DemoDb };
        if (parsed.version !== STORE_VERSION || !parsed.db) return null;
        return revive(parsed.db);
    } catch {
        return null;
    }
}
