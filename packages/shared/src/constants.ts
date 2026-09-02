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
 * `patients.ref` is the random part alone — `W5F5`, four characters, no date.
 *
 * The date prefix is what makes an appointment ref scoped to a day, and a
 * patient is not an event: they are registered once and the number goes at the
 * top of their page in the paper book for good. Four characters is what someone
 * writes at the top of a page without resenting it, and 31⁴ is 923,521 of them
 * — a clinic that has seen ten thousand patients still collides on about one
 * insert in ninety, which the UNIQUE constraint and a retry absorb.
 *
 * Deliberately shaped so it cannot be mistaken for an appointment ref: one has
 * a date and a hyphen, the other does not.
 */
export const PATIENT_REF_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/i;

// --- money (§9) -------------------------------------------------------------

/** Money is integer piastres throughout. 100 piastres = 1 EGP. */
export const PIASTRES_PER_POUND = 100;

/**
 * Upper bound on any single amount, in piastres (1,000,000 EGP). Guards against
 * a fat-fingered entry becoming a permanent balance.
 */
export const MAX_AMOUNT_PIASTRES = 100_000_000;

// --- settings defaults (§5) -------------------------------------------------

export const DEFAULT_DURATION_OPTIONS = [10, 20, 30, 45] as const;
export const DEFAULT_DURATION_MINUTES = 30;
export const DEFAULT_REMINDER_LEAD_HOURS = 24;
/** Local clinic time. The daily notification fires at this time (§11). */
export const DEFAULT_REMINDER_NOTIFY_AT = '19:00';
export const DEFAULT_REMINDER_REPEAT_MINUTES = 30;

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
} as const;

export type WsEvent = (typeof WS_EVENT)[keyof typeof WS_EVENT];

/** Path the tRPC fetch adapter is mounted at (§4). */
export const TRPC_ENDPOINT = '/trpc';
/** Path the websocket upgrade is handled at (§4). */
export const WS_PATH = '/ws';
