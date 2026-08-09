import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ERROR_CODE } from '@mawid/shared';
import { AppError } from '../src/errors/AppError.ts';
import { appointmentService } from '../src/modules/appointment/appointment.service.ts';
import { balanceService } from '../src/modules/balance/balance.service.ts';
import { branchService } from '../src/modules/branch/branch.service.ts';
import { customQuestionService } from '../src/modules/customQuestion/customQuestion.service.ts';
import { patientService } from '../src/modules/patient/patient.service.ts';
import { procedureService } from '../src/modules/procedure/procedure.service.ts';
import { reminderService, renderTemplate } from '../src/modules/reminder/reminder.service.ts';
import { setClinicDayInput } from '../src/modules/settings/settings.schema.ts';
import { settingsService } from '../src/modules/settings/settings.service.ts';
import { statsService } from '../src/modules/stats/stats.service.ts';
import { setProceduresInput } from '../src/modules/visit/visit.schema.ts';
import { visitService } from '../src/modules/visit/visit.service.ts';
import { setupDatabase, sql, truncateAll } from './helpers/db.ts';
import {
    CHECKUP_PRICE,
    EXTRACTION_PRICE,
    expectAppError,
    clinic as fixtures,
    ROOT_CANAL_PRICE,
    slot,
} from './helpers/factories.ts';

/**
 * Phase 1 modules against a real Postgres. The rules worth asserting are the
 * ones the schema cannot hold on its own: the checkup waiver (§9), one level of
 * procedure nesting (§5), status transitions (§7), and balances being derived
 * rather than stored (§10).
 */

beforeAll(async () => {
    await setupDatabase();
});

beforeEach(async () => {
    await truncateAll();
});

describe('settings', () => {
    test('seeds a single row on first read', async () => {
        const settings = await settingsService.get();

        expect(settings.clinicName).toBeString();
        expect(settings.durationOptions.length).toBeGreaterThan(0);
        expect(settings.durationOptions).toContain(settings.defaultDuration);
    });

    test('is idempotent — reading twice does not create a second row', async () => {
        await settingsService.get();
        await settingsService.ensureSeeded();
        const settings = await settingsService.get();

        expect(settings.clinicName).toBeString();
    });

    test('updates and sorts duration options', async () => {
        const updated = await settingsService.update({ durationOptions: [45, 15, 30], defaultDuration: 15 });

        expect(updated.durationOptions).toEqual([15, 30, 45]);
        expect(updated.defaultDuration).toBe(15);
    });

    test('refuses a default duration outside the options', async () => {
        await expectAppError(ERROR_CODE.INVALID_DURATION, () =>
            settingsService.update({ durationOptions: [30], defaultDuration: 20 }),
        );
    });

    test('returns the notification time as HH:MM', async () => {
        const updated = await settingsService.update({ reminderNotifyAt: '18:30' });
        expect(updated.reminderNotifyAt).toBe('18:30');
    });
});

/**
 * MAW-1. A weekday with no row is closed — the day view renders it as closed
 * rather than as an empty schedule, so absence is the meaningful case here.
 */
describe('clinic days', () => {
    test('an unset weekday is closed', async () => {
        expect(await settingsService.schedule()).toEqual([]);
        expect(await settingsService.dayFor(1)).toBeNull();
    });

    test('sets a weekday and returns hours as HH:MM', async () => {
        const { branch } = await fixtures();

        const day = await settingsService.setDay({
            weekday: 1,
            branchId: branch.id,
            opensAt: '10:00',
            closesAt: '18:00',
        });

        expect(day).toEqual({ weekday: 1, branchId: branch.id, opensAt: '10:00', closesAt: '18:00' });
        expect(await settingsService.dayFor(1)).toEqual(day);
    });

    test('setting the same weekday twice replaces it rather than adding a second branch', async () => {
        const { branch } = await fixtures();
        const other = await branchService.create({ name: 'Second' });

        await settingsService.setDay({
            weekday: 2,
            branchId: branch.id,
            opensAt: '10:00',
            closesAt: '18:00',
        });
        await settingsService.setDay({
            weekday: 2,
            branchId: other.id,
            opensAt: '12:00',
            closesAt: '20:00',
        });

        const schedule = await settingsService.schedule();
        expect(schedule).toEqual([{ weekday: 2, branchId: other.id, opensAt: '12:00', closesAt: '20:00' }]);
    });

    test('lists open weekdays in order', async () => {
        const { branch } = await fixtures();
        for (const weekday of [4, 0, 2]) {
            await settingsService.setDay({
                weekday,
                branchId: branch.id,
                opensAt: '10:00',
                closesAt: '18:00',
            });
        }

        expect((await settingsService.schedule()).map((d) => d.weekday)).toEqual([0, 2, 4]);
    });

    test('clearing a weekday closes it, and clearing a closed day is a no-op', async () => {
        const { branch } = await fixtures();
        await settingsService.setDay({
            weekday: 3,
            branchId: branch.id,
            opensAt: '10:00',
            closesAt: '18:00',
        });

        await settingsService.clearDay(3);
        await settingsService.clearDay(3);

        expect(await settingsService.dayFor(3)).toBeNull();
        expect(await settingsService.schedule()).toEqual([]);
    });

    test('refuses a branch that does not exist', async () => {
        await expectAppError(ERROR_CODE.NOT_FOUND, () =>
            settingsService.setDay({
                weekday: 1,
                branchId: Bun.randomUUIDv7(),
                opensAt: '10:00',
                closesAt: '18:00',
            }),
        );
    });

    test('rejects closing before opening', () => {
        const result = setClinicDayInput.safeParse({
            weekday: 1,
            branchId: Bun.randomUUIDv7(),
            opensAt: '18:00',
            closesAt: '10:00',
        });

        expect(result.success).toBe(false);
    });

    test('rejects a time carrying seconds, which would not survive the round trip', () => {
        const result = setClinicDayInput.safeParse({
            weekday: 1,
            branchId: Bun.randomUUIDv7(),
            opensAt: '10:00:15',
            closesAt: '18:00',
        });

        expect(result.success).toBe(false);
    });

    test('rejects a weekday outside 0–6', () => {
        const branchId = Bun.randomUUIDv7();
        const hours = { opensAt: '10:00', closesAt: '18:00' };

        expect(setClinicDayInput.safeParse({ weekday: 7, branchId, ...hours }).success).toBe(false);
        expect(setClinicDayInput.safeParse({ weekday: -1, branchId, ...hours }).success).toBe(false);
    });
});

describe('procedure', () => {
    test('nests one level and marks categories unselectable', async () => {
        const category = await procedureService.create({
            name: 'Endodontics',
            defaultPrice: 0,
            hasQuantity: false,
            isToothSpecific: false,
            isCheckup: false,
            sortOrder: 0,
        });
        await procedureService.create({
            parentId: category.id,
            name: 'Root canal',
            defaultPrice: ROOT_CANAL_PRICE,
            hasQuantity: false,
            isToothSpecific: false,
            isCheckup: false,
            sortOrder: 0,
        });

        const tree = await procedureService.tree();
        const root = tree.find((n) => n.id === category.id);

        expect(root?.children.length).toBe(1);
        expect(root?.selectable).toBe(false);
    });

    test('a childless root is itself selectable', async () => {
        const solo = await procedureService.create({
            name: 'Checkup',
            defaultPrice: CHECKUP_PRICE,
            hasQuantity: false,
            isToothSpecific: false,
            isCheckup: true,
            sortOrder: 0,
        });

        const tree = await procedureService.tree();
        expect(tree.find((n) => n.id === solo.id)?.selectable).toBe(true);
        expect(await procedureService.requireSelectable(solo.id)).toBeTruthy();
    });

    test('refuses a third level', async () => {
        const category = await procedureService.create({
            name: 'Endodontics',
            defaultPrice: 0,
            hasQuantity: false,
            isToothSpecific: false,
            isCheckup: false,
            sortOrder: 0,
        });
        const child = await procedureService.create({
            parentId: category.id,
            name: 'Root canal',
            defaultPrice: ROOT_CANAL_PRICE,
            hasQuantity: false,
            isToothSpecific: false,
            isCheckup: false,
            sortOrder: 0,
        });

        await expectAppError(ERROR_CODE.PROCEDURE_NESTING_TOO_DEEP, () =>
            procedureService.create({
                parentId: child.id,
                name: 'Molar',
                defaultPrice: 1,
                hasQuantity: false,
                isToothSpecific: false,
                isCheckup: false,
                sortOrder: 0,
            }),
        );
    });

    test('refuses to put a procedure on a visit when it is a category', async () => {
        const category = await procedureService.create({
            name: 'Endodontics',
            defaultPrice: 0,
            hasQuantity: false,
            isToothSpecific: false,
            isCheckup: false,
            sortOrder: 0,
        });
        await procedureService.create({
            parentId: category.id,
            name: 'Root canal',
            defaultPrice: ROOT_CANAL_PRICE,
            hasQuantity: false,
            isToothSpecific: false,
            isCheckup: false,
            sortOrder: 0,
        });

        await expectAppError(ERROR_CODE.PROCEDURE_NOT_SELECTABLE, () =>
            procedureService.requireSelectable(category.id),
        );
    });

    test('deactivating a subtype does not make its category selectable', async () => {
        const category = await procedureService.create({
            name: 'Endodontics',
            defaultPrice: 0,
            hasQuantity: false,
            isToothSpecific: false,
            isCheckup: false,
            sortOrder: 0,
        });
        const child = await procedureService.create({
            parentId: category.id,
            name: 'Root canal',
            defaultPrice: ROOT_CANAL_PRICE,
            hasQuantity: false,
            isToothSpecific: false,
            isCheckup: false,
            sortOrder: 0,
        });
        // Selectable before, so the assertions below are about the change and
        // not about an empty list.
        expect((await procedureService.selectableList()).map((p) => p.id)).toEqual([child.id]);

        await procedureService.update({ id: child.id, active: false });

        const selectable = await procedureService.selectableList();
        // The subtype is gone, and its category did not inherit selectability:
        // a category with no bookable children is bookable by nobody.
        expect(selectable.map((p) => p.id)).not.toContain(child.id);
        expect(selectable.map((p) => p.id)).not.toContain(category.id);

        const root = (await procedureService.tree()).find((n) => n.id === category.id);
        expect(root?.selectable).toBe(false);
    });
});

describe('customQuestion', () => {
    test('rejects a duplicate key', async () => {
        await customQuestionService.create({
            key: 'allergies',
            label: 'Allergies',
            kind: 'text',
            required: false,
            sortOrder: 0,
        });

        await expectAppError(ERROR_CODE.DUPLICATE_KEY, () =>
            customQuestionService.create({
                key: 'allergies',
                label: 'Allergies again',
                kind: 'text',
                required: false,
                sortOrder: 0,
            }),
        );
    });

    test('intake enforces required answers', async () => {
        await customQuestionService.create({
            key: 'blood_thinners',
            label: 'On blood thinners?',
            kind: 'boolean',
            required: true,
            sortOrder: 0,
        });

        await expectAppError(ERROR_CODE.CUSTOM_QUESTION_REQUIRED, () =>
            customQuestionService.validateIntake({}),
        );
    });

    test('checks the answer against the question kind', async () => {
        await customQuestionService.create({
            key: 'visits_per_year',
            label: 'Visits per year',
            kind: 'number',
            required: false,
            sortOrder: 0,
        });

        expect(await customQuestionService.validateIntake({ visits_per_year: '3' })).toEqual({
            visits_per_year: 3,
        });
        await expectAppError(ERROR_CODE.VALIDATION, () =>
            customQuestionService.validateIntake({ visits_per_year: 'often' }),
        );
    });

    test('a date answer is a real calendar day, stored as it came in', async () => {
        await customQuestionService.create({
            key: 'last_xray',
            label: 'Last x-ray',
            kind: 'date',
            required: false,
            sortOrder: 0,
        });

        expect(await customQuestionService.validateIntake({ last_xray: '2026-02-28' })).toEqual({
            last_xray: '2026-02-28',
        });

        // A day that does not exist, the wrong shape, and a timestamp — the
        // stored value is a calendar date, with no time to drift across a
        // timezone.
        for (const answer of ['2026-02-31', '28-02-2026', '2026-02-28T10:00:00Z']) {
            await expectAppError(ERROR_CODE.VALIDATION, () =>
                customQuestionService.validateIntake({ last_xray: answer }),
            );
        }
    });

    test('a select answer must be one of its options', async () => {
        await customQuestionService.create({
            key: 'referral',
            label: 'How did you hear about us?',
            kind: 'select',
            options: ['friend', 'facebook'],
            required: false,
            sortOrder: 0,
        });

        expect(await customQuestionService.validateIntake({ referral: 'friend' })).toEqual({
            referral: 'friend',
        });
        await expectAppError(ERROR_CODE.VALIDATION, () =>
            customQuestionService.validateIntake({ referral: 'billboard' }),
        );
    });

    test('refuses an answer to a key no question owns', async () => {
        await expectAppError(ERROR_CODE.VALIDATION, () =>
            customQuestionService.validateIntake({ allergies: 'penicillin' }),
        );
        await expectAppError(ERROR_CODE.VALIDATION, () =>
            customQuestionService.validatePatch({}, { allergeis: 'penicillin' }),
        );
    });

    /**
     * The questionnaire moves; the records stay. Everything below is a change
     * the doctor makes years after an answer was given, and none of it may
     * touch an answer the caller did not submit.
     */
    describe('a patch against a questionnaire that has since changed', () => {
        test('does not demand a question that became required', async () => {
            const question = await customQuestionService.create({
                key: 'blood_thinners',
                label: 'On blood thinners?',
                kind: 'boolean',
                required: false,
                sortOrder: 0,
            });
            await customQuestionService.create({
                key: 'allergies',
                label: 'Allergies',
                kind: 'text',
                required: false,
                sortOrder: 1,
            });

            const stored = await customQuestionService.validateIntake({ allergies: 'none' });
            await customQuestionService.update({ id: question.id, required: true });

            expect(await customQuestionService.validatePatch(stored, { allergies: 'penicillin' })).toEqual({
                allergies: 'penicillin',
            });
        });

        test('keeps a select answer whose option was removed', async () => {
            const question = await customQuestionService.create({
                key: 'referral',
                label: 'How did you hear about us?',
                kind: 'select',
                options: ['friend', 'facebook'],
                required: false,
                sortOrder: 0,
            });
            await customQuestionService.create({
                key: 'allergies',
                label: 'Allergies',
                kind: 'text',
                required: false,
                sortOrder: 1,
            });

            const stored = await customQuestionService.validateIntake({ referral: 'facebook' });
            await customQuestionService.update({ id: question.id, options: ['friend'] });

            expect(await customQuestionService.validatePatch(stored, { allergies: 'none' })).toEqual({
                referral: 'facebook',
                allergies: 'none',
            });
            // Re-submitting it is another matter: that is the caller choosing an
            // option the form no longer offers.
            await expectAppError(ERROR_CODE.VALIDATION, () =>
                customQuestionService.validatePatch(stored, { referral: 'facebook' }),
            );
        });

        test('keeps the answer to a deactivated question, and still lets it be edited', async () => {
            const question = await customQuestionService.create({
                key: 'referral',
                label: 'How did you hear about us?',
                kind: 'select',
                options: ['friend', 'facebook'],
                required: true,
                sortOrder: 0,
            });
            await customQuestionService.create({
                key: 'allergies',
                label: 'Allergies',
                kind: 'text',
                required: false,
                sortOrder: 1,
            });

            const stored = await customQuestionService.validateIntake({ referral: 'friend' });
            await customQuestionService.update({ id: question.id, active: false });

            expect(await customQuestionService.validatePatch(stored, { allergies: 'none' })).toEqual({
                referral: 'friend',
                allergies: 'none',
            });
            // No longer required, because it is no longer asked.
            expect(await customQuestionService.validatePatch(stored, { referral: '' })).toEqual({});
        });
    });

    test('reports what a record is missing against the questionnaire today', async () => {
        const referral = await customQuestionService.create({
            key: 'referral',
            label: 'How did you hear about us?',
            kind: 'select',
            options: ['friend', 'facebook'],
            required: false,
            sortOrder: 0,
        });
        const retired = await customQuestionService.create({
            key: 'fax',
            label: 'Fax number',
            kind: 'text',
            required: false,
            sortOrder: 1,
        });

        const stored = await customQuestionService.validateIntake({ referral: 'facebook', fax: '123' });
        expect(await customQuestionService.auditAnswers(stored)).toEqual([]);

        // The doctor drops the option this patient picked, retires a question
        // outright, and adds one nobody on the books has answered.
        await customQuestionService.update({ id: referral.id, options: ['friend', 'instagram'] });
        await customQuestionService.update({ id: retired.id, active: false });
        await customQuestionService.create({
            key: 'blood_thinners',
            label: 'On blood thinners?',
            kind: 'boolean',
            required: true,
            sortOrder: 2,
        });

        // In the questionnaire's own order, and silent about the retired
        // question — it is not asked any more, so nobody is behind on it.
        expect(await customQuestionService.auditAnswers(stored)).toEqual([
            {
                key: 'referral',
                label: 'How did you hear about us?',
                required: false,
                reason: 'answer_no_longer_valid',
            },
            {
                key: 'blood_thinners',
                label: 'On blood thinners?',
                required: true,
                reason: 'unanswered',
            },
        ]);
    });

    test('a blank answer clears the key, unless the question is required', async () => {
        await customQuestionService.create({
            key: 'allergies',
            label: 'Allergies',
            kind: 'text',
            required: false,
            sortOrder: 0,
        });
        await customQuestionService.create({
            key: 'blood_thinners',
            label: 'On blood thinners?',
            kind: 'boolean',
            required: true,
            sortOrder: 1,
        });

        const stored = await customQuestionService.validateIntake({
            allergies: 'penicillin',
            blood_thinners: true,
        });

        expect(await customQuestionService.validatePatch(stored, { allergies: '' })).toEqual({
            blood_thinners: true,
        });
        await expectAppError(ERROR_CODE.CUSTOM_QUESTION_REQUIRED, () =>
            customQuestionService.validatePatch(stored, { blood_thinners: null }),
        );
    });
});

describe('patient', () => {
    test('normalizes the phone on write and derives age on read', async () => {
        const created = await patientService.create({
            name: 'Nadia Hassan',
            phone: '01012345678',
            birthDate: '1990-01-01',
            custom: {},
        });

        expect(created.phone).toBe('+201012345678');
        expect(created.age).toBeGreaterThan(30);
    });

    test('finds a patient by name fragment or by local phone', async () => {
        await patientService.create({ name: 'Nadia Hassan', phone: '01012345678', custom: {} });

        expect((await patientService.search({ q: 'adia', limit: 25 })).length).toBe(1);
        expect((await patientService.search({ q: '01012345678', limit: 25 })).length).toBe(1);
        expect((await patientService.search({ q: 'nobody', limit: 25 })).length).toBe(0);
    });

    test('merges a partial custom patch instead of replacing it', async () => {
        await customQuestionService.create({
            key: 'allergies',
            label: 'Allergies',
            kind: 'text',
            required: false,
            sortOrder: 0,
        });
        await customQuestionService.create({
            key: 'notes_for_doctor',
            label: 'Notes',
            kind: 'text',
            required: false,
            sortOrder: 1,
        });

        const created = await patientService.create({
            name: 'Nadia Hassan',
            phone: '01012345678',
            custom: { allergies: 'penicillin', notes_for_doctor: 'anxious' },
        });

        const updated = await patientService.update({ id: created.id, custom: { allergies: 'none' } });

        expect(updated.custom).toEqual({ allergies: 'none', notes_for_doctor: 'anxious' });
    });

    test('editing an old patient survives the questionnaire changing under them', async () => {
        const referral = await customQuestionService.create({
            key: 'referral',
            label: 'How did you hear about us?',
            kind: 'select',
            options: ['friend', 'facebook'],
            required: false,
            sortOrder: 0,
        });
        const bloodThinners = await customQuestionService.create({
            key: 'blood_thinners',
            label: 'On blood thinners?',
            kind: 'boolean',
            required: false,
            sortOrder: 1,
        });

        const created = await patientService.create({
            name: 'Nadia Hassan',
            phone: '01012345678',
            custom: { referral: 'facebook' },
        });

        // Two years of the doctor tidying up the form.
        await customQuestionService.update({ id: referral.id, options: ['friend', 'instagram'] });
        await customQuestionService.update({ id: bloodThinners.id, required: true });

        const updated = await patientService.update({ id: created.id, phone: '01098765432' });

        expect(updated.phone).toBe('+201098765432');
        expect(updated.custom).toEqual({ referral: 'facebook' });
    });

    test('answers a question added long after the patient was registered', async () => {
        const created = await patientService.create({
            name: 'Nadia Hassan',
            phone: '01012345678',
            custom: {},
        });

        await customQuestionService.create({
            key: 'blood_thinners',
            label: 'On blood thinners?',
            kind: 'boolean',
            required: true,
            sortOrder: 0,
        });

        // The record is behind the form, and `byId` is where the clinic sees it.
        const before = await patientService.byId(created.id);
        expect(before.questionnaireGaps).toEqual([
            {
                key: 'blood_thinners',
                label: 'On blood thinners?',
                required: true,
                reason: 'unanswered',
            },
        ]);

        const updated = await patientService.update({
            id: created.id,
            custom: { blood_thinners: false },
        });

        expect(updated.custom).toEqual({ blood_thinners: false });
        expect((await patientService.byId(created.id)).questionnaireGaps).toEqual([]);
    });

    test('rejects a phone that cannot be normalized', async () => {
        await expectAppError(ERROR_CODE.INVALID_PHONE, () =>
            patientService.create({ name: 'Nobody', phone: 'not a phone', custom: {} }),
        );
    });
});

describe('appointment', () => {
    test('books, generates a ref, and creates the reminder', async () => {
        const { branch, patient } = await fixtures();

        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });

        expect(appointment.ref).toMatch(/^\d{6}-[A-Z2-9]{4}$/);
        expect(appointment.status).toBe('booked');

        const pending = await reminderService.pending({ dueOnly: false, limit: 100, offsetMinutes: 0 });
        expect(pending.map((r) => r.appointmentId)).toContain(appointment.id);
    });

    test('creates the patient in the same call when they are new', async () => {
        const { branch } = await fixtures();

        const appointment = await appointmentService.create({
            patient: { kind: 'new', name: 'Walk-up Wael', phone: '01099999999' },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });

        const found = await patientService.search({ q: 'Wael', limit: 25 });
        expect(found[0]?.id).toBe(appointment.patientId);
        expect(found[0]?.phone).toBe('+201099999999');
    });

    test('reports an overlap as SLOT_OVERLAP rather than a database error', async () => {
        const { branch, patient } = await fixtures();
        const startsAt = slot();

        await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt,
            offsetMinutes: 0,
        });

        await expectAppError(ERROR_CODE.SLOT_OVERLAP, () =>
            appointmentService.create({
                patient: { kind: 'existing', patientId: patient.id },
                branchId: branch.id,
                startsAt,
                offsetMinutes: 0,
            }),
        );
    });

    test('refuses a duration the clinic has not configured', async () => {
        const { branch, patient } = await fixtures();

        await expectAppError(ERROR_CODE.INVALID_DURATION, () =>
            appointmentService.create({
                patient: { kind: 'existing', patientId: patient.id },
                branchId: branch.id,
                startsAt: slot(),
                durationMinutes: 37,
                offsetMinutes: 0,
            }),
        );
    });

    test('the day view embeds the patient', async () => {
        const { branch, patient } = await fixtures();
        const startsAt = slot();

        await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt,
            offsetMinutes: 0,
        });

        const day = await appointmentService.byDate({
            date: startsAt.slice(0, 10),
            branchId: branch.id,
            offsetMinutes: 0,
        });

        expect(day.length).toBe(1);
        expect(day[0]?.patient.name).toBe('Nadia Hassan');
    });

    test('cancelling frees the slot and skips the reminder', async () => {
        const { branch, patient } = await fixtures();
        const startsAt = slot();

        const first = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt,
            offsetMinutes: 0,
        });

        await appointmentService.cancel(first.id);

        const rebooked = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt,
            offsetMinutes: 0,
        });

        expect(rebooked.id).not.toBe(first.id);

        const pending = await reminderService.pending({ dueOnly: false, limit: 100, offsetMinutes: 0 });
        expect(pending.map((r) => r.appointmentId)).not.toContain(first.id);
    });

    test('refuses to cancel twice', async () => {
        const { branch, patient } = await fixtures();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });

        await appointmentService.cancel(appointment.id);
        await expectAppError(ERROR_CODE.INVALID_STATUS_TRANSITION, () =>
            appointmentService.cancel(appointment.id),
        );
    });

    test('a walk-in books and checks in at once', async () => {
        const { branch, patient } = await fixtures();

        const { appointment, visitId } = await appointmentService.walkIn({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            offsetMinutes: 0,
        });

        expect(appointment.channel).toBe('walk_in');
        expect(appointment.status).toBe('checked_in');

        const visit = await visitService.byId(visitId);
        // §8 — the checkup line is seeded on check-in.
        expect(visit.procedures.length).toBe(1);
        expect(visit.chargedTotal).toBe(CHECKUP_PRICE);
    });

    test('lists an appointment that has already ended as missed', async () => {
        const { branch, patient } = await fixtures();
        const past = new Date(Date.now() - 3 * 3_600_000).toISOString();

        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: past,
            offsetMinutes: 0,
        });

        const missed = await appointmentService.missed({ limit: 100 });
        expect(missed.map((a) => a.id)).toContain(appointment.id);

        // §7 — nothing transitions on a timer; it is still booked.
        expect(missed.find((a) => a.id === appointment.id)?.status).toBe('booked');
    });

    test('never lists an appointment awaiting payment as missed', async () => {
        const { branch, patient } = await fixtures();
        const past = new Date(Date.now() - 3 * 3_600_000).toISOString();

        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: past,
            offsetMinutes: 0,
        });
        await visitService.checkIn({ appointmentId: appointment.id });
        await appointmentService.awaitPayment(appointment.id);

        // §7 — missed is `booked` past its end, and nothing else. The patient
        // is standing at the desk; they did not fail to turn up.
        const missed = await appointmentService.missed({ limit: 100 });
        expect(missed.map((a) => a.id)).not.toContain(appointment.id);
    });

    test('the doctor sends a checked-in patient to the desk to pay', async () => {
        const { branch, patient } = await fixtures();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        await visitService.checkIn({ appointmentId: appointment.id });

        const awaiting = await appointmentService.awaitPayment(appointment.id);
        expect(awaiting.status).toBe('awaiting_payment');
    });

    test('refuses to await payment on an appointment that is only booked', async () => {
        const { branch, patient } = await fixtures();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });

        await expectAppError(ERROR_CODE.INVALID_STATUS_TRANSITION, () =>
            appointmentService.awaitPayment(appointment.id),
        );
    });

    test('refuses to await payment twice', async () => {
        const { branch, patient } = await fixtures();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        await visitService.checkIn({ appointmentId: appointment.id });
        await appointmentService.awaitPayment(appointment.id);

        await expectAppError(ERROR_CODE.INVALID_STATUS_TRANSITION, () =>
            appointmentService.awaitPayment(appointment.id),
        );
    });

    test('refuses to await payment on a cancelled appointment', async () => {
        const { branch, patient } = await fixtures();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        await appointmentService.cancel(appointment.id);

        await expectAppError(ERROR_CODE.INVALID_STATUS_TRANSITION, () =>
            appointmentService.awaitPayment(appointment.id),
        );
    });

    test('two concurrent calls cannot both move the same appointment', async () => {
        const { branch, patient } = await fixtures();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        await visitService.checkIn({ appointmentId: appointment.id });

        // The status check and the write are one statement, so the loser here
        // is refused rather than overwriting a status that moved underneath it
        // — a checkout landing in the gap would otherwise strand a settled
        // visit against an appointment stuck in `awaiting_payment`.
        const results = await Promise.allSettled([
            appointmentService.awaitPayment(appointment.id),
            appointmentService.awaitPayment(appointment.id),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
        const rejected = results.find((r) => r.status === 'rejected');
        expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
        expect(((rejected as PromiseRejectedResult).reason as AppError).code).toBe(
            ERROR_CODE.INVALID_STATUS_TRANSITION,
        );
    });

    test('an appointment awaiting payment frees its slot for a new booking', async () => {
        const { branch, patient } = await fixtures();
        const startsAt = slot();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt,
            offsetMinutes: 0,
        });
        await visitService.checkIn({ appointmentId: appointment.id });

        // Checked in, the slot is held.
        await expectAppError(ERROR_CODE.SLOT_OVERLAP, () =>
            appointmentService.create({
                patient: { kind: 'existing', patientId: patient.id },
                branchId: branch.id,
                startsAt,
                offsetMinutes: 0,
            }),
        );

        await appointmentService.awaitPayment(appointment.id);

        const next = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt,
            offsetMinutes: 0,
        });
        expect(next.id).toBeTruthy();
    });
});

describe('visit', () => {
    async function checkedIn() {
        const f = await fixtures();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: f.patient.id },
            branchId: f.branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        const visit = await visitService.checkIn({ appointmentId: appointment.id });
        return { ...f, appointment, visit };
    }

    test('check-in seeds the checkup line and prices the visit at it', async () => {
        const { visit } = await checkedIn();
        const detail = await visitService.byId(visit.id);

        expect(detail.procedures[0]?.isCheckup).toBe(true);
        expect(detail.computedTotal).toBe(CHECKUP_PRICE);
        expect(detail.chargedTotal).toBe(CHECKUP_PRICE);
    });

    test('refuses a second check-in for the same appointment', async () => {
        const { appointment } = await checkedIn();

        await expectAppError(ERROR_CODE.INVALID_STATUS_TRANSITION, () =>
            visitService.checkIn({ appointmentId: appointment.id }),
        );
    });

    test('adding a procedure waives the checkup', async () => {
        const { visit, checkup, rootCanal } = await checkedIn();

        const updated = await visitService.setProcedures({
            visitId: visit.id,
            procedures: [
                { procedureId: checkup.id, quantity: 1 },
                { procedureId: rootCanal.id, quantity: 1 },
            ],
        });

        // §9 — the checkup line stays on the visit but leaves the total.
        expect(updated.procedures.length).toBe(2);
        expect(updated.computedTotal).toBe(ROOT_CANAL_PRICE);
    });

    test('multiplies a quantity procedure by its quantity', async () => {
        const { visit, xray } = await checkedIn();

        const updated = await visitService.setProcedures({
            visitId: visit.id,
            procedures: [{ procedureId: xray.id, quantity: 3 }],
        });

        expect(updated.computedTotal).toBe(15_000);
    });

    test('refuses a repeat of a procedure that does not take a quantity', async () => {
        const { visit, rootCanal } = await checkedIn();

        await expectAppError(ERROR_CODE.PROCEDURE_DUPLICATE, () =>
            visitService.setProcedures({
                visitId: visit.id,
                procedures: [
                    { procedureId: rootCanal.id, quantity: 1 },
                    { procedureId: rootCanal.id, quantity: 1 },
                ],
            }),
        );
    });

    test('allows a repeat of the same procedure on a different tooth', async () => {
        const { visit, extraction } = await checkedIn();

        const updated = await visitService.setProcedures({
            visitId: visit.id,
            procedures: [
                { procedureId: extraction.id, quantity: 1, tooth: 'UL6' },
                { procedureId: extraction.id, quantity: 1, tooth: 'UR3' },
            ],
        });

        // §5 — uniqueness is per tooth. Two extractions is two extractions.
        expect(updated.procedures.length).toBe(2);
        expect(updated.computedTotal).toBe(EXTRACTION_PRICE * 2);
        expect(updated.procedures.map((p) => p.tooth).sort()).toEqual(['UL6', 'UR3']);
    });

    test('refuses a repeat of the same procedure on the same tooth', async () => {
        const { visit, extraction } = await checkedIn();

        await expectAppError(ERROR_CODE.PROCEDURE_DUPLICATE, () =>
            visitService.setProcedures({
                visitId: visit.id,
                procedures: [
                    { procedureId: extraction.id, quantity: 1, tooth: 'UL6' },
                    { procedureId: extraction.id, quantity: 1, tooth: 'UL6' },
                ],
            }),
        );
    });

    test('refuses a tooth-specific procedure with no tooth', async () => {
        const { visit, extraction } = await checkedIn();

        await expectAppError(ERROR_CODE.TOOTH_REQUIRED, () =>
            visitService.setProcedures({
                visitId: visit.id,
                procedures: [{ procedureId: extraction.id, quantity: 1 }],
            }),
        );
    });

    test('refuses a tooth on a procedure that is not tooth-specific', async () => {
        const { visit, rootCanal } = await checkedIn();

        await expectAppError(ERROR_CODE.TOOTH_NOT_APPLICABLE, () =>
            visitService.setProcedures({
                visitId: visit.id,
                procedures: [{ procedureId: rootCanal.id, quantity: 1, tooth: 'UL6' }],
            }),
        );
    });

    test('leaves tooth null on a procedure that is not tooth-specific', async () => {
        const { visit, rootCanal } = await checkedIn();

        const updated = await visitService.setProcedures({
            visitId: visit.id,
            procedures: [{ procedureId: rootCanal.id, quantity: 1 }],
        });
        expect(updated.procedures[0]?.tooth).toBeNull();
    });

    test('rejects a tooth that is not on the chart', async () => {
        const { visit, extraction } = await checkedIn();

        // The client picks from `TEETH`; nothing else parses.
        expect(
            setProceduresInput.safeParse({
                visitId: visit.id,
                procedures: [{ procedureId: extraction.id, quantity: 1, tooth: 'UL9' }],
            }).success,
        ).toBe(false);
    });

    test('snapshots the price, so a later price change does not rewrite history', async () => {
        const { visit, rootCanal } = await checkedIn();

        await visitService.setProcedures({
            visitId: visit.id,
            procedures: [{ procedureId: rootCanal.id, quantity: 1 }],
        });
        await procedureService.update({ id: rootCanal.id, defaultPrice: 999_999 });

        const detail = await visitService.byId(visit.id);
        expect(detail.procedures[0]?.unitPrice).toBe(ROOT_CANAL_PRICE);
        expect(detail.computedTotal).toBe(ROOT_CANAL_PRICE);
    });

    test('an explicit price survives a later procedure edit', async () => {
        const { visit, rootCanal } = await checkedIn();

        await visitService.setPrice({ visitId: visit.id, chargedTotal: 200_000 });
        const updated = await visitService.setProcedures({
            visitId: visit.id,
            procedures: [{ procedureId: rootCanal.id, quantity: 1 }],
        });

        // §9 — the difference from computed is the discount, and it is the
        // clinic's, not something a recompute may quietly undo.
        expect(updated.computedTotal).toBe(ROOT_CANAL_PRICE);
        expect(updated.chargedTotal).toBe(200_000);
    });

    test('refuses to re-price a visit that is already checked out', async () => {
        const { visit } = await checkedIn();
        await visitService.checkOut({
            visitId: visit.id,
            chargedTotal: 100_000,
            paidTotal: 40_000,
            method: 'cash',
        });

        // What the patient owes was settled at checkout. Moving it afterwards
        // would silently change a balance someone has already been quoted —
        // §10 has `recordPayment` for what comes next, not a re-price.
        await expectAppError(ERROR_CODE.VISIT_ALREADY_COMPLETED, () =>
            visitService.setPrice({ visitId: visit.id, chargedTotal: 10_000 }),
        );

        const after = await visitService.byId(visit.id);
        expect(after.chargedTotal).toBe(100_000);
        expect(after.balance).toBe(60_000);
    });

    test('checks out with a partial payment and leaves a balance', async () => {
        const { visit, appointment } = await checkedIn();

        const done = await visitService.checkOut({
            visitId: visit.id,
            chargedTotal: 100_000,
            paidTotal: 40_000,
            method: 'cash',
        });

        expect(done.completedAt).not.toBeNull();
        expect(done.paidTotal).toBe(40_000);
        expect(done.balance).toBe(60_000);

        const after = await appointmentService.byId(appointment.id);
        expect(after.status).toBe('done');
    });

    test('checks out a patient the doctor sent to the desk', async () => {
        const { visit, appointment } = await checkedIn();
        await appointmentService.awaitPayment(appointment.id);

        // §7 — checkout accepts `awaiting_payment` as readily as `checked_in`.
        const done = await visitService.checkOut({
            visitId: visit.id,
            chargedTotal: 100_000,
            paidTotal: 100_000,
            method: 'cash',
        });

        expect(done.completedAt).not.toBeNull();
        expect(done.balance).toBe(0);
        expect((await appointmentService.byId(appointment.id)).status).toBe('done');
    });

    test('refuses to check out against an appointment that is not in progress', async () => {
        const { visit, appointment } = await checkedIn();
        // A no-show is set on the appointment, so the visit row survives while
        // the appointment leaves the states checkout is allowed to close.
        await sql`UPDATE appointments SET status = 'no_show' WHERE id = ${appointment.id}`;

        await expectAppError(ERROR_CODE.INVALID_STATUS_TRANSITION, () =>
            visitService.checkOut({
                visitId: visit.id,
                chargedTotal: 100_000,
                paidTotal: 0,
                method: 'cash',
            }),
        );
    });

    test('checks out with nothing paid', async () => {
        const { visit } = await checkedIn();

        const done = await visitService.checkOut({
            visitId: visit.id,
            chargedTotal: 100_000,
            paidTotal: 0,
            method: 'cash',
        });

        expect(done.payments.length).toBe(0);
        expect(done.balance).toBe(100_000);
    });

    test('refuses to check out twice', async () => {
        const { visit } = await checkedIn();
        await visitService.checkOut({
            visitId: visit.id,
            chargedTotal: 1_000,
            paidTotal: 0,
            method: 'cash',
        });

        await expectAppError(ERROR_CODE.VISIT_ALREADY_COMPLETED, () =>
            visitService.checkOut({
                visitId: visit.id,
                chargedTotal: 1_000,
                paidTotal: 0,
                method: 'cash',
            }),
        );
    });

    test('records a later payment against the balance', async () => {
        const { visit } = await checkedIn();
        await visitService.checkOut({
            visitId: visit.id,
            chargedTotal: 100_000,
            paidTotal: 40_000,
            method: 'cash',
        });

        const after = await visitService.recordPayment({
            visitId: visit.id,
            amount: 60_000,
            method: 'instapay',
        });

        expect(after.paidTotal).toBe(100_000);
        expect(after.balance).toBe(0);
        // §10 — `charged_total` is not touched by a payment.
        expect(after.chargedTotal).toBe(100_000);
    });

    test("requires a note when the method is 'other'", async () => {
        const { visit } = await checkedIn();

        await expectAppError(ERROR_CODE.PAYMENT_NOTE_REQUIRED, () =>
            visitService.recordPayment({
                visitId: visit.id,
                amount: 1_000,
                method: 'other',
                methodNote: null,
            }),
        );
    });
});

describe('balance', () => {
    async function owing(amount: number, paid: number) {
        const f = await fixtures();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: f.patient.id },
            branchId: f.branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        const visit = await visitService.checkIn({ appointmentId: appointment.id });
        await visitService.checkOut({
            visitId: visit.id,
            chargedTotal: amount,
            paidTotal: paid,
            method: 'cash',
        });
        return { ...f, visit };
    }

    test('aggregates what a patient owes across visits', async () => {
        const { patient } = await owing(100_000, 40_000);

        const report = await balanceService.outstanding();
        expect(report.total).toBe(60_000);
        expect(report.patients[0]?.patientId).toBe(patient.id);
        expect(report.patients[0]?.balance).toBe(60_000);
    });

    test('a fully paid visit does not appear', async () => {
        await owing(100_000, 100_000);

        const report = await balanceService.outstanding();
        expect(report.total).toBe(0);
        expect(report.patients.length).toBe(0);
    });

    test('lists the patient visits that still owe', async () => {
        const { patient, visit } = await owing(100_000, 40_000);

        const rows = await balanceService.byPatient(patient.id);
        expect(rows.length).toBe(1);
        expect(rows[0]?.visitId).toBe(visit.id);
        expect(rows[0]?.balance).toBe(60_000);
    });

    test('reports charged against collected for a period', async () => {
        await owing(100_000, 40_000);
        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

        const summary = await balanceService.summary({ from: today, to: tomorrow, offsetMinutes: 0 });

        expect(summary.charged).toBe(100_000);
        expect(summary.collected).toBe(40_000);
        expect(summary.difference).toBe(60_000);
    });
});

describe('reminder', () => {
    test('renders a template and builds the WhatsApp link', async () => {
        const { branch, patient } = await fixtures();
        await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });

        const [reminder] = await reminderService.pending({ dueOnly: false, limit: 100, offsetMinutes: 0 });

        expect(reminder?.message).toContain('Nadia Hassan');
        expect(reminder?.whatsAppUrl.startsWith('https://wa.me/201012345678?text=')).toBe(true);
    });

    test('marking sent takes it off the pending list', async () => {
        const { branch, patient } = await fixtures();
        await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });

        const [reminder] = await reminderService.pending({ dueOnly: false, limit: 100, offsetMinutes: 0 });
        if (!reminder) throw new Error('expected a pending reminder');

        await reminderService.markSent(reminder.id);

        expect((await reminderService.pending({ dueOnly: false, limit: 100, offsetMinutes: 0 })).length).toBe(
            0,
        );
    });

    test('dismissing for today records the date on settings', async () => {
        await reminderService.dismissToday({ date: '2026-08-03' });
        expect((await settingsService.get()).reminderDismissedOn).toBe('2026-08-03');
    });

    test('leaves an unknown placeholder visible rather than dropping it', () => {
        expect(renderTemplate('Hi {{name}}, {{nonsense}}', { name: 'Nadia' })).toBe('Hi Nadia, {{nonsense}}');
    });
});

describe('stats', () => {
    test('counts appointments and money for a period', async () => {
        const { branch, patient } = await fixtures();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        const visit = await visitService.checkIn({ appointmentId: appointment.id });
        await visitService.checkOut({
            visitId: visit.id,
            chargedTotal: 100_000,
            paidTotal: 100_000,
            method: 'cash',
        });

        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

        const summary = await statsService.summary({ from: today, to: tomorrow, offsetMinutes: 0 });

        expect(summary.appointments.total).toBe(1);
        expect(summary.appointments.completed).toBe(1);
        expect(summary.visits.charged).toBe(100_000);
        expect(summary.visits.collected).toBe(100_000);
        expect(summary.topProcedures[0]?.name).toBe('Checkup');
    });
});
