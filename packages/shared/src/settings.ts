/**
 * SPEC §12 — what a settings row reads as, and the one rule an update has to
 * pass. Run by the server over the Postgres row and by the demo backend over its
 * in-memory one.
 *
 * Postgres returns `time` as `HH:MM:SS`, so times are trimmed to `HH:MM` for the
 * client. `defaultDuration` must stay inside `durationOptions`, or the picker
 * would offer a default nobody can pick.
 */
import { ERROR_CODE, type Fail } from './errors.ts';

export interface Settings {
    clinicName: string;
    clinicPhone: string | null;
    durationOptions: number[];
    defaultDuration: number;
    reminderLeadHours: number;
    reminderNotifyAt: string;
    reminderRepeatMinutes: number;
    reminderDismissedOn: string | null;
    reminderTemplate: string;
    /** The last patient number handed out. The next registration gets one more. */
    patientRefLast: number;
    updatedAt: Date;
}

export function toSettings(row: Settings): Settings {
    return {
        clinicName: row.clinicName,
        clinicPhone: row.clinicPhone,
        durationOptions: [...row.durationOptions].sort((a, b) => a - b),
        defaultDuration: row.defaultDuration,
        reminderLeadHours: row.reminderLeadHours,
        reminderNotifyAt: row.reminderNotifyAt.slice(0, 5),
        reminderRepeatMinutes: row.reminderRepeatMinutes,
        reminderDismissedOn: row.reminderDismissedOn,
        reminderTemplate: row.reminderTemplate,
        patientRefLast: row.patientRefLast,
        updatedAt: row.updatedAt,
    };
}

/**
 * Where numbering carries on from. Refused below the highest numbered ref
 * already on a patient: the next registration would be handed a number someone
 * already has. Raising it leaves a gap, which is the clinic's call.
 */
export function assertPatientRefLast(value: number, highestTaken: number, fail: Fail): number {
    if (value < highestTaken) {
        throw fail(
            ERROR_CODE.PATIENT_REF_BELOW_EXISTING,
            `patientRefLast must not be below ${highestTaken}, the highest patient ref in use`,
            422,
        );
    }
    return value;
}

type Durations = Pick<Settings, 'durationOptions' | 'defaultDuration'>;

/** The durations an update leaves behind: deduplicated, ascending, and holding the default. */
export function resolveDurations(input: Partial<Durations>, current: Durations, fail: Fail): Durations {
    const durationOptions = input.durationOptions
        ? [...new Set(input.durationOptions)].sort((a, b) => a - b)
        : [...current.durationOptions].sort((a, b) => a - b);
    const defaultDuration = input.defaultDuration ?? current.defaultDuration;

    if (!durationOptions.includes(defaultDuration)) {
        throw fail(ERROR_CODE.INVALID_DURATION, 'defaultDuration must be one of durationOptions', 422);
    }

    return { durationOptions, defaultDuration };
}

export interface ClinicDay {
    weekday: number;
    branchId: string;
    opensAt: string;
    closesAt: string;
}

export function toClinicDay(row: ClinicDay): ClinicDay {
    return {
        weekday: row.weekday,
        branchId: row.branchId,
        opensAt: row.opensAt.slice(0, 5),
        closesAt: row.closesAt.slice(0, 5),
    };
}
