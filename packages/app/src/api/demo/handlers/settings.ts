/**
 * `server/src/modules/settings/settings.service.ts`, over the arrays in
 * `../db`. The single enforced row is a single object, so there is nothing to
 * seed on read.
 */
import { ERROR_CODE, WS_EVENT } from '@lustre/shared';
import type { RouterInput, RouterOutput } from '../../types';
import { type ClinicDayRow, getDb, type SettingsRow, save } from '../db';
import { broadcast } from '../events';
import { assignDefined, DemoError } from '../rules';
import type { Dated } from '../wire';
import { branchHandlers } from './branch';

type Settings = Dated<RouterOutput['settings']['get']>;
type ClinicDay = Dated<RouterOutput['settings']['schedule'][number]>;

function toSettings(row: SettingsRow): Settings {
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
        updatedAt: row.updatedAt,
    };
}

function toClinicDay(row: ClinicDayRow): ClinicDay {
    return {
        weekday: row.weekday,
        branchId: row.branchId,
        opensAt: row.opensAt.slice(0, 5),
        closesAt: row.closesAt.slice(0, 5),
    };
}

export const settingsHandlers = {
    get(): Settings {
        return toSettings(getDb().settings);
    },

    update(input: RouterInput['settings']['update']): Settings {
        const current = getDb().settings;

        const durationOptions = input.durationOptions
            ? [...new Set(input.durationOptions)].sort((a, b) => a - b)
            : [...current.durationOptions].sort((a, b) => a - b);
        const defaultDuration = input.defaultDuration ?? current.defaultDuration;

        // The picker would otherwise offer a default nobody can pick.
        if (!durationOptions.includes(defaultDuration)) {
            throw new DemoError(
                ERROR_CODE.INVALID_DURATION,
                'defaultDuration must be one of durationOptions',
                422,
            );
        }

        assignDefined(current, input, { durationOptions, defaultDuration, updatedAt: new Date() });
        save();

        broadcast(WS_EVENT.SETTINGS_UPDATED);
        return toSettings(current);
    },

    schedule(): ClinicDay[] {
        return [...getDb().clinicDays].sort((a, b) => a.weekday - b.weekday).map(toClinicDay);
    },

    dayFor(weekday: number): ClinicDay | null {
        const row = getDb().clinicDays.find((day) => day.weekday === weekday);
        return row ? toClinicDay(row) : null;
    },

    setDay(input: RouterInput['settings']['setDay']): ClinicDay {
        branchHandlers.byId(input.branchId);

        const db = getDb();
        const existing = db.clinicDays.find((day) => day.weekday === input.weekday);

        const row: ClinicDayRow = existing ?? { ...input };
        if (existing) Object.assign(existing, input);
        else db.clinicDays.push(row);

        save();
        broadcast(WS_EVENT.SETTINGS_UPDATED);
        return toClinicDay(row);
    },

    clearDay(input: RouterInput['settings']['clearDay']): void {
        const db = getDb();
        db.clinicDays = db.clinicDays.filter((day) => day.weekday !== input.weekday);

        save();
        broadcast(WS_EVENT.SETTINGS_UPDATED);
    },

    dismissRemindersFor(date: string): Settings {
        const current = getDb().settings;
        current.reminderDismissedOn = date;
        current.updatedAt = new Date();

        save();
        broadcast(WS_EVENT.SETTINGS_UPDATED);
        return toSettings(current);
    },
};
