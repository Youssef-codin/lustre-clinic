/**
 * `server/src/modules/settings/settings.service.ts`, over the arrays in
 * `../db`. The single enforced row is a single object, so there is nothing to
 * seed on read.
 */
import { resolveDurations, toClinicDay, toSettings, WS_EVENT } from '@lustre/shared';
import type { RouterInput, RouterOutput } from '../../types';
import { type ClinicDayRow, getDb, save } from '../db';
import { broadcast } from '../events';
import { assignDefined, demoFail } from '../rules';
import type { Dated } from '../wire';
import { branchHandlers } from './branch';

type Settings = Dated<RouterOutput['settings']['get']>;
type ClinicDay = Dated<RouterOutput['settings']['schedule'][number]>;

export const settingsHandlers = {
    get(): Settings {
        return toSettings(getDb().settings);
    },

    update(input: RouterInput['settings']['update']): Settings {
        const current = getDb().settings;
        const { durationOptions, defaultDuration } = resolveDurations(input, current, demoFail);

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
