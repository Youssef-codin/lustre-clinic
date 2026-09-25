/**
 * Constants shared by both sides (SPEC §5, §11, §13). Anything the clinic can
 * change is a database row, not a value here — these are the ones that are
 * structural, or are the seeded default for a row.
 */

// --- refs (§5) --------------------------------------------------------------

/**
 * Alphabet for the random part of every ref. Excludes `0`/`O` and `1`/`I`/`L`
 * so a ref read aloud, read off a screen, or **written onto a paper file** is
 * unambiguous — the last of those is why patients have one at all.
 */
export const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Length of the random part. Shared by both refs below. */
export const REF_RANDOM_LENGTH = 4;

/** `appointments.ref` is `DDMMYY-XXXX`, day first. Stored uppercase, matched case-insensitively. */
export const REF_PATTERN = /^\d{6}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/i;

/**
 * `patients.ref` is a plain number — `1`, `2`, `3` — carried on from the
 * clinic's own count, which `settings.patient_ref_last` holds.
 *
 * The date prefix is what makes an appointment ref scoped to a day, and a
 * patient is not an event: they are registered once and the number goes at the
 * top of their page in the paper book for good.
 *
 * Patients registered before numbering keep the four-character random code they
 * were given (`W5F5`), and the demo backend still draws those, so both shapes
 * are valid. Neither can be mistaken for an appointment ref: that one has a date
 * and a hyphen.
 */
export const PATIENT_REF_PATTERN = /^(?:[1-9]\d*|[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})$/i;

/** `settings.patient_ref_next` is a Postgres `integer`. */
export const MAX_PATIENT_REF = 2_147_483_647;

/**
 * The longest an old system's number may be. Free text, because the format is
 * that system's and not this one's — see `patients.legacy_ref`.
 */
export const MAX_OLD_REF_LENGTH = 64;

// --- money (§9) -------------------------------------------------------------

/** Money is integer piastres throughout. 100 piastres = 1 EGP. */
export const PIASTRES_PER_POUND = 100;

/**
 * Upper bound on any single amount, in piastres (1,000,000 EGP). Guards against
 * a fat-fingered entry becoming a permanent balance.
 */
export const MAX_AMOUNT_PIASTRES = 100_000_000;

/**
 * Longest a procedure or category may be named.
 *
 * Shared because both ends have to agree on it: the Zod schema refuses anything
 * longer, and the field stops accepting at the same count. A limit enforced
 * only on the server is one the secretary meets after typing a name and
 * pressing Save, which is the worst moment to hear about it.
 */
export const MAX_PROCEDURE_NAME = 160;

// --- settings defaults (§5) -------------------------------------------------

export const DEFAULT_DURATION_OPTIONS = [10, 20, 30, 45] as const;
export const DEFAULT_DURATION_MINUTES = 30;
export const DEFAULT_REMINDER_LEAD_HOURS = 24;
/** Local clinic time. The daily notification fires at this time (§11). */
export const DEFAULT_REMINDER_NOTIFY_AT = '19:00';
export const DEFAULT_REMINDER_REPEAT_MINUTES = 30;

/**
 * Whether a registration is refused without an age, or without a sex. The
 * clinic turns either on or off in Settings → Patient fields; these are what a
 * clinic that has not touched them gets, which is how it worked before it could
 * choose.
 */
export const DEFAULT_REQUIRE_AGE = true;
export const DEFAULT_REQUIRE_GENDER = false;

/** Seeded on first boot. The clinic renames itself in-app (§12). */
export const DEFAULT_CLINIC_NAME = 'Clinic';

/**
 * Seeded reminder message (§11). Placeholders are substituted at send time;
 * anything unrecognized is left as written, so a typo is visible rather than
 * silently dropped.
 */
export const DEFAULT_REMINDER_TEMPLATE =
    'Hello {{name}}, this is a reminder of your appointment at {{clinic}} on {{date}} at {{time}}.';

export const REMINDER_PLACEHOLDERS = ['name', 'clinic', 'date', 'time', 'ref'] as const;
export type ReminderPlaceholder = (typeof REMINDER_PLACEHOLDERS)[number];

/** Bounds for a duration, independent of what the clinic configures. */
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 480;

// --- websocket (§13) --------------------------------------------------------

/**
 * Events pushed over `/ws`. Kept separate from tRPC: with two clients and low
 * volume, tRPC subscriptions are not required.
 */
export const WS_EVENT = {
    APPOINTMENT_CREATED: 'appointment:created',
    APPOINTMENT_UPDATED: 'appointment:updated',
    VISIT_UPDATED: 'visit:updated',
    SETTINGS_UPDATED: 'settings:updated',
    PATIENT_UPDATED: 'patient:updated',
    REMINDER_UPDATED: 'reminder:updated',
    /** Branches, procedure types and the intake questionnaire: reference data, not a record. */
    CATALOG_UPDATED: 'catalog:updated',
    /** The doctor is finished and the patient is on the way to the desk (`checked_in → awaiting_payment`). */
    VISIT_COMPLETED: 'visit:completed',
    /** A patient has arrived and is checked in (`booked → checked_in`), walk-ins included. */
    APPOINTMENT_CHECKED_IN: 'appointment:checked_in',
} as const;

export type WsEvent = (typeof WS_EVENT)[keyof typeof WS_EVENT];

/** Bumped when a frame's shape changes. A client that reads a version it does not know refetches everything. */
export const WS_PROTOCOL_VERSION = 1;

/** Query parameters a reconnecting client resumes with: the server process it last heard from, and the last `seq` it applied. */
export const WS_RESUME_PARAM = { EPOCH: 'epoch', SINCE: 'since' } as const;

/**
 * What `/ws` sends. `epoch` names one server process and `seq` counts up from 1
 * within it, so a client can tell a duplicate, a gap and a restart apart. `hello`
 * closes every connect, after any replay: `resync` says the missed events could
 * not be replayed and everything must be refetched. IDs only, never patient data.
 */
export type WsFrame =
    | { v: number; type: 'event'; epoch: string; seq: number; at: number; event: WsEvent; id?: string }
    | { v: number; type: 'hello'; epoch: string; seq: number; resync: boolean };

/** Path the tRPC fetch adapter is mounted at (§4). */
export const TRPC_ENDPOINT = '/trpc';
/** Path the websocket upgrade is handled at (§4). */
export const WS_PATH = '/ws';

// --- releases (§15) ---------------------------------------------------------

/** The latest release APK, served beside `/trpc` on the tailnet address. */
export const APK_PATH = '/app/android.apk';
/** Where a release build's expo-updates asks for a manifest. */
export const UPDATES_MANIFEST_PATH = '/updates/manifest';
/** Prefix of an update's bundle and assets: `<prefix>/<runtime>/<id>/<path>`. */
export const UPDATES_ASSETS_PATH = '/updates/assets';
/** The one channel the server publishes to. Dev and demo builds never ask. */
export const UPDATES_CHANNEL = 'production';
