/**
 * Constants shared by both sides (SPEC §5, §11, §13). Anything the clinic can
 * change is a database row, not a value here — these are the ones that are
 * structural, or are the seeded default for a row.
 */

// --- appointment ref (§5) ---------------------------------------------------

/**
 * Alphabet for the random part of `appointments.ref`. Excludes `0`/`O` and
 * `1`/`I`/`L` so a ref read aloud or off a screen is unambiguous.
 */
export const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Length of the random suffix. `ref` is `DDMMYY-XXXX`, day first. */
export const REF_RANDOM_LENGTH = 4;

/** Stored uppercase, matched case-insensitively. */
export const REF_PATTERN = /^\d{6}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/i;

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
