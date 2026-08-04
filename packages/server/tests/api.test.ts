import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ERROR_CODE, WS_EVENT } from '@mawid/shared';
import { setupDatabase, truncateAll } from './helpers/db.ts';
import { CHECKUP_PRICE, ROOT_CANAL_PRICE, slot } from './helpers/factories.ts';
import {
    captureWsEvents,
    expectTrpcError,
    expectValidationError,
    startTestServer,
    type TestServer,
} from './helpers/trpc.ts';

/**
 * SPEC §13 — the API surface, over the transport the app actually uses.
 *
 * The service suites import services directly, so three layers sit between them
 * and a real request and none of it is covered: the Zod input schemas, the
 * `AppError` → HTTP status mapping in `trpc/init.ts`, and the router wiring.
 * `router.test.ts` asserts the paths exist; this asserts they work, reject what
 * they should, and fail with the code and status the client switches on.
 */

let api: TestServer;

/** The clinic, built through the API rather than through the services. */
async function clinicViaApi() {
    const { client } = api;

    const branch = await client.branch.create.mutate({ name: 'Main' });
    const checkup = await client.procedure.create.mutate({
        name: 'Checkup',
        defaultPrice: CHECKUP_PRICE,
        hasQuantity: false,
        isCheckup: true,
        sortOrder: 0,
    });
    const rootCanal = await client.procedure.create.mutate({
        name: 'Root canal',
        defaultPrice: ROOT_CANAL_PRICE,
        hasQuantity: false,
        isCheckup: false,
        sortOrder: 1,
    });
    const patient = await client.patient.create.mutate({
        name: 'Nadia Hassan',
        phone: '01012345678',
        custom: {},
    });

    return { branch, checkup, rootCanal, patient };
}

beforeAll(async () => {
    await setupDatabase();
    api = startTestServer();
});

afterAll(() => {
    api.stop();
});

beforeEach(async () => {
    await truncateAll();
});

describe('every path in §13 answers', () => {
    test('the read-only endpoints respond on an empty clinic', async () => {
        const { client } = api;

        expect((await client.health.check.query()).ok).toBe(true);
        expect((await client.settings.get.query()).clinicName).toBeString();
        expect(await client.branch.list.query()).toEqual([]);
        expect(await client.procedure.tree.query()).toEqual([]);
        expect(await client.customQuestion.list.query()).toEqual([]);
        expect(await client.patient.search.query({ q: 'nobody' })).toEqual([]);
        expect(await client.appointment.missed.query()).toEqual([]);
        expect(await client.reminder.pending.query()).toEqual([]);

        const balances = await client.balance.outstanding.query();
        expect(balances.total).toBe(0);
        expect(balances.patients).toEqual([]);
    });

    test('the write endpoints round-trip through the API', async () => {
        const { client } = api;
        const { branch, patient, checkup } = await clinicViaApi();

        expect(branch.name).toBe('Main');
        // §5 — the phone is normalized on the way in, whatever the caller sent.
        expect(patient.phone).toBe('+201012345678');
        expect(checkup.isCheckup).toBe(true);

        const renamed = await client.branch.update.mutate({ id: branch.id, name: 'Downtown' });
        expect(renamed.name).toBe('Downtown');

        const question = await client.customQuestion.create.mutate({
            key: 'allergies',
            label: 'Allergies',
            kind: 'text',
            required: false,
            sortOrder: 0,
        });
        const relabelled = await client.customQuestion.update.mutate({
            id: question.id,
            label: 'Known allergies',
        });
        expect(relabelled.label).toBe('Known allergies');

        const repriced = await client.procedure.update.mutate({
            id: checkup.id,
            defaultPrice: 35_000,
        });
        expect(repriced.defaultPrice).toBe(35_000);

        const updatedPatient = await client.patient.update.mutate({
            id: patient.id,
            name: 'Nadia H.',
        });
        expect(updatedPatient.name).toBe('Nadia H.');

        // §6 — `patient.byId` is the history view: the record plus every visit.
        const detail = await client.patient.byId.query({ id: patient.id });
        expect(detail.patient.name).toBe('Nadia H.');
        expect(detail.visits).toEqual([]);

        const settings = await client.settings.update.mutate({ clinicName: 'Mawid Dental' });
        expect(settings.clinicName).toBe('Mawid Dental');
    });

    test('the period summaries answer for a range', async () => {
        const { client } = api;
        const range = { from: '2026-01-01', to: '2027-01-01' };

        const balance = await client.balance.summary.query(range);
        expect(balance.charged).toBe(0);

        const stats = await client.stats.summary.query(range);
        expect(stats.appointments.total).toBe(0);
    });

    test('reminder.dismissToday records the date on settings', async () => {
        const { client } = api;

        await client.reminder.dismissToday.mutate({ date: '2026-08-03' });

        expect((await client.settings.get.query()).reminderDismissedOn).toBe('2026-08-03');
    });
});

describe('a full visit, end to end', () => {
    test('books, checks in, prices, checks out, and settles the balance', async () => {
        const { client } = api;
        const { branch, patient, rootCanal } = await clinicViaApi();

        const appointment = await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
        });
        expect(appointment.status).toBe('booked');
        expect(appointment.ref).toMatch(/^\d{6}-[A-Z2-9]{4}$/);

        // §8 — check-in seeds the checkup line, so the visit is priced before
        // anyone has entered a procedure.
        const visit = await client.visit.checkIn.mutate({ appointmentId: appointment.id });
        const seeded = await client.visit.byId.query({ id: visit.id });
        expect(seeded.chargedTotal).toBe(CHECKUP_PRICE);
        expect(seeded.balance).toBe(CHECKUP_PRICE);

        // §9 — any other line waives the checkup.
        const priced = await client.visit.setProcedures.mutate({
            visitId: visit.id,
            procedures: [{ procedureId: rootCanal.id, quantity: 1 }],
        });
        expect(priced.computedTotal).toBe(ROOT_CANAL_PRICE);

        const discounted = await client.visit.setPrice.mutate({
            visitId: visit.id,
            chargedTotal: 200_000,
        });
        expect(discounted.chargedTotal).toBe(200_000);

        const done = await client.visit.checkOut.mutate({
            visitId: visit.id,
            chargedTotal: 200_000,
            paidTotal: 50_000,
            method: 'cash',
        });
        expect(done.balance).toBe(150_000);
        expect((await client.appointment.byId.query({ id: appointment.id })).status).toBe('done');

        // §10 — the balance is derived, and the patient shows up owing it.
        const outstanding = await client.balance.outstanding.query();
        expect(outstanding.total).toBe(150_000);
        expect(outstanding.patients[0]?.patientId).toBe(patient.id);

        const settled = await client.visit.recordPayment.mutate({
            visitId: visit.id,
            amount: 150_000,
            method: 'instapay',
        });
        expect(settled.balance).toBe(0);
        // A payment never edits what was charged.
        expect(settled.chargedTotal).toBe(200_000);

        expect((await client.balance.outstanding.query()).total).toBe(0);
        expect(await client.balance.byPatient.query({ patientId: patient.id })).toEqual([]);
    });

    test('a walk-in books and checks in through one call', async () => {
        const { client } = api;
        const { branch, patient } = await clinicViaApi();

        const { appointment, visitId } = await client.appointment.walkIn.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
        });

        expect(appointment.channel).toBe('walk_in');
        expect(appointment.status).toBe('checked_in');
        expect((await client.visit.byId.query({ id: visitId })).chargedTotal).toBe(CHECKUP_PRICE);
    });

    test('the day view embeds the patient the client renders', async () => {
        const { client } = api;
        const { branch, patient } = await clinicViaApi();
        const startsAt = slot();

        await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt,
        });

        const day = await client.appointment.byDate.query({
            date: startsAt.slice(0, 10),
            branchId: branch.id,
        });

        expect(day.length).toBe(1);
        expect(day[0]?.patient.name).toBe('Nadia Hassan');
    });

    test('cancel and the reminder calls work over the wire', async () => {
        const { client } = api;
        const { branch, patient } = await clinicViaApi();

        const first = await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
        });

        const pending = await client.reminder.pending.query({ dueOnly: false });
        expect(pending.map((r) => r.appointmentId)).toContain(first.id);
        await client.reminder.markSent.mutate({ id: pending[0]?.id ?? '' });

        const second = await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: new Date(Date.parse(slot()) + 3_600_000).toISOString(),
        });
        const stillPending = await client.reminder.pending.query({ dueOnly: false });
        await client.reminder.markSkipped.mutate({ id: stillPending[0]?.id ?? '' });

        const cancelled = await client.appointment.cancel.mutate({ id: second.id });
        expect(cancelled.status).toBe('cancelled');

        const noShow = await client.appointment.update.mutate({ id: first.id, status: 'no_show' });
        expect(noShow.status).toBe('no_show');
    });
});

describe('input validation', () => {
    test('rejects a malformed uuid before it reaches a service', async () => {
        await expectValidationError(() => api.client.patient.byId.query({ id: 'not-a-uuid' }));
        await expectValidationError(() => api.client.visit.byId.query({ id: '123' }));
    });

    test('rejects a startsAt that is not an ISO instant', async () => {
        const { branch, patient } = await clinicViaApi();

        await expectValidationError(() =>
            api.client.appointment.create.mutate({
                patient: { kind: 'existing', patientId: patient.id },
                branchId: branch.id,
                startsAt: 'tomorrow morning',
            }),
        );
    });

    test('rejects a duration outside the bounds the picker can offer', async () => {
        const { branch, patient } = await clinicViaApi();

        // §5 bounds, independent of what the clinic configures. A value inside
        // the bounds but outside the options is a domain error, not a schema
        // one — see the INVALID_DURATION case below.
        for (const durationMinutes of [0, 4, 481]) {
            await expectValidationError(() =>
                api.client.appointment.create.mutate({
                    patient: { kind: 'existing', patientId: patient.id },
                    branchId: branch.id,
                    startsAt: slot(),
                    durationMinutes,
                }),
            );
        }
    });

    test('rejects a limit above its ceiling', async () => {
        await expectValidationError(() => api.client.patient.search.query({ q: 'a', limit: 5_000 }));
        await expectValidationError(() => api.client.reminder.pending.query({ dueOnly: false, limit: 999 }));
    });

    test('rejects a malformed member of the patient union', async () => {
        const { branch } = await clinicViaApi();

        // `kind: 'new'` needs a name and a phone; the discriminated union has
        // to reject the half-filled member rather than fall through to the
        // other one.
        await expectValidationError(() =>
            api.client.appointment.create.mutate({
                // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed
                patient: { kind: 'new', name: 'No Phone' } as any,
                branchId: branch.id,
                startsAt: slot(),
            }),
        );
        await expectValidationError(() =>
            api.client.appointment.create.mutate({
                // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed
                patient: { kind: 'nonsense', patientId: Bun.randomUUIDv7() } as any,
                branchId: branch.id,
                startsAt: slot(),
            }),
        );
    });

    test('rejects a negative amount — money is unsigned piastres', async () => {
        const { client } = api;
        const { branch, patient } = await clinicViaApi();
        const appointment = await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
        });
        const visit = await client.visit.checkIn.mutate({ appointmentId: appointment.id });

        await expectValidationError(() =>
            client.visit.setPrice.mutate({ visitId: visit.id, chargedTotal: -1 }),
        );
        // §9 — no floats anywhere.
        await expectValidationError(() =>
            client.visit.setPrice.mutate({ visitId: visit.id, chargedTotal: 100.5 }),
        );
        await expectValidationError(() =>
            client.visit.recordPayment.mutate({ visitId: visit.id, amount: 0, method: 'cash' }),
        );
    });

    test("rejects method 'other' without a note at the schema, not the service", async () => {
        const { client } = api;
        const { branch, patient } = await clinicViaApi();
        const appointment = await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
        });
        const visit = await client.visit.checkIn.mutate({ appointmentId: appointment.id });

        await expectValidationError(() =>
            client.visit.recordPayment.mutate({
                visitId: visit.id,
                amount: 1_000,
                method: 'other',
            }),
        );
    });

    test('rejects a custom-question key that is not lower_snake_case', async () => {
        await expectValidationError(() =>
            api.client.customQuestion.create.mutate({
                key: 'Blood Thinners',
                label: 'On blood thinners?',
                kind: 'boolean',
            }),
        );
    });

    test('rejects a select question with no options', async () => {
        await expectValidationError(() =>
            api.client.customQuestion.create.mutate({
                key: 'referral',
                label: 'How did you hear about us?',
                kind: 'select',
            }),
        );
    });

    test('rejects a settings time that is not HH:MM', async () => {
        await expectValidationError(() => api.client.settings.update.mutate({ reminderNotifyAt: '7pm' }));
    });

    test('rejects a date that is not YYYY-MM-DD', async () => {
        await expectValidationError(() =>
            api.client.balance.summary.query({ from: '01/01/2026', to: '2026-02-01' }),
        );
    });
});

describe('error mapping', () => {
    test('an unknown row is 404 NOT_FOUND', async () => {
        // Well-formed but absent — past the schema, refused by the service.
        await expectTrpcError(ERROR_CODE.NOT_FOUND, 404, () =>
            api.client.patient.byId.query({ id: Bun.randomUUIDv7() }),
        );
        await expectTrpcError(ERROR_CODE.NOT_FOUND, 404, () =>
            api.client.visit.byId.query({ id: Bun.randomUUIDv7() }),
        );
        await expectTrpcError(ERROR_CODE.NOT_FOUND, 404, () =>
            api.client.appointment.byId.query({ id: Bun.randomUUIDv7() }),
        );
    });

    test('an overlapping booking is 409 SLOT_OVERLAP', async () => {
        const { client } = api;
        const { branch, patient } = await clinicViaApi();
        const startsAt = slot();

        await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt,
        });

        await expectTrpcError(ERROR_CODE.SLOT_OVERLAP, 409, () =>
            client.appointment.create.mutate({
                patient: { kind: 'existing', patientId: patient.id },
                branchId: branch.id,
                startsAt,
            }),
        );
    });

    test('a duration the clinic has not configured is 422 INVALID_DURATION', async () => {
        const { branch, patient } = await clinicViaApi();

        // 37 is inside the §5 bounds, so the schema lets it through; only the
        // service knows the clinic offers 10/20/30/45.
        await expectTrpcError(ERROR_CODE.INVALID_DURATION, 422, () =>
            api.client.appointment.create.mutate({
                patient: { kind: 'existing', patientId: patient.id },
                branchId: branch.id,
                startsAt: slot(),
                durationMinutes: 37,
            }),
        );
    });

    test('an illegal status change is 422 INVALID_STATUS_TRANSITION', async () => {
        const { client } = api;
        const { branch, patient } = await clinicViaApi();
        const appointment = await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
        });
        await client.appointment.cancel.mutate({ id: appointment.id });

        await expectTrpcError(ERROR_CODE.INVALID_STATUS_TRANSITION, 422, () =>
            client.appointment.cancel.mutate({ id: appointment.id }),
        );
    });

    test('a repeated non-quantity procedure is 422 PROCEDURE_DUPLICATE', async () => {
        const { client } = api;
        const { branch, patient, rootCanal } = await clinicViaApi();
        const appointment = await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
        });
        const visit = await client.visit.checkIn.mutate({ appointmentId: appointment.id });

        await expectTrpcError(ERROR_CODE.PROCEDURE_DUPLICATE, 422, () =>
            client.visit.setProcedures.mutate({
                visitId: visit.id,
                procedures: [
                    { procedureId: rootCanal.id, quantity: 1 },
                    { procedureId: rootCanal.id, quantity: 1 },
                ],
            }),
        );
    });

    test('a second checkout is 409 VISIT_ALREADY_COMPLETED', async () => {
        const { client } = api;
        const { branch, patient } = await clinicViaApi();
        const appointment = await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
        });
        const visit = await client.visit.checkIn.mutate({ appointmentId: appointment.id });
        await client.visit.checkOut.mutate({
            visitId: visit.id,
            chargedTotal: 1_000,
            paidTotal: 0,
            method: 'cash',
        });

        await expectTrpcError(ERROR_CODE.VISIT_ALREADY_COMPLETED, 409, () =>
            client.visit.checkOut.mutate({
                visitId: visit.id,
                chargedTotal: 1_000,
                paidTotal: 0,
                method: 'cash',
            }),
        );
    });

    test('an unnormalizable phone is 422 INVALID_PHONE', async () => {
        await expectTrpcError(ERROR_CODE.INVALID_PHONE, 422, () =>
            api.client.patient.create.mutate({ name: 'Nobody', phone: 'not a phone', custom: {} }),
        );
    });

    test('a duplicate custom-question key is DUPLICATE_KEY', async () => {
        const { client } = api;
        await client.customQuestion.create.mutate({
            key: 'allergies',
            label: 'Allergies',
            kind: 'text',
        });

        try {
            await client.customQuestion.create.mutate({
                key: 'allergies',
                label: 'Again',
                kind: 'text',
            });
            throw new Error('expected DUPLICATE_KEY');
        } catch (err) {
            expect((err as { data?: { appCode?: string } }).data?.appCode).toBe(ERROR_CODE.DUPLICATE_KEY);
        }
    });

    test('an unknown procedure path is 404 NOT_FOUND with an appCode', async () => {
        const res = await fetch(`${api.endpoint}/does.notExist`);
        const body = (await res.json()) as { error: { data: { appCode: string; httpStatus: number } } };

        expect(res.status).toBe(404);
        expect(body.error.data.appCode).toBe(ERROR_CODE.NOT_FOUND);
    });

    test('every failure carries an appCode the client can localize from', async () => {
        // §4 — the client switches on `appCode` and never parses `message`.
        // A response without one leaves it with nothing to show.
        const res = await fetch(
            `${api.endpoint}/patient.byId?input=${encodeURIComponent(JSON.stringify({ id: 'bad' }))}`,
        );
        const body = (await res.json()) as { error: { data: { appCode?: string } } };

        expect(body.error.data.appCode).toBe(ERROR_CODE.VALIDATION);
    });
});

describe('websocket broadcasts', () => {
    test('a booking pushes appointment:created carrying only an id', async () => {
        const { branch, patient } = await clinicViaApi();

        const { result, events } = await captureWsEvents(api.wsUrl, () =>
            api.client.appointment.create.mutate({
                patient: { kind: 'existing', patientId: patient.id },
                branchId: branch.id,
                startsAt: slot(),
            }),
        );

        expect(events).toEqual([{ event: WS_EVENT.APPOINTMENT_CREATED, id: result.id }]);
    });

    test('check-in pushes both the visit and the appointment', async () => {
        const { client } = api;
        const { branch, patient } = await clinicViaApi();
        const appointment = await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: slot(),
        });

        const { result, events } = await captureWsEvents(api.wsUrl, () =>
            client.visit.checkIn.mutate({ appointmentId: appointment.id }),
        );

        // Both screens have to refetch: the day view shows the status, the
        // visit screen shows the seeded line.
        expect(events).toContainEqual({ event: WS_EVENT.VISIT_UPDATED, id: result.id });
        expect(events).toContainEqual({
            event: WS_EVENT.APPOINTMENT_UPDATED,
            id: appointment.id,
        });
    });

    test('a settings change pushes settings:updated', async () => {
        const { events } = await captureWsEvents(api.wsUrl, () =>
            api.client.settings.update.mutate({ clinicName: 'Renamed Clinic' }),
        );

        expect(events).toEqual([{ event: WS_EVENT.SETTINGS_UPDATED }]);
    });

    test('a failed mutation broadcasts nothing', async () => {
        // The broadcast happens after the transaction commits. A push for a
        // booking that never happened would have every client refetch a row
        // that does not exist.
        const { client } = api;
        const { branch, patient } = await clinicViaApi();
        const startsAt = slot();
        await client.appointment.create.mutate({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt,
        });

        const { events } = await captureWsEvents(api.wsUrl, async () => {
            await expectTrpcError(ERROR_CODE.SLOT_OVERLAP, 409, () =>
                client.appointment.create.mutate({
                    patient: { kind: 'existing', patientId: patient.id },
                    branchId: branch.id,
                    startsAt,
                }),
            );
        });

        expect(events).toEqual([]);
    });

    test('no payload ever carries patient data', async () => {
        // §13 — payloads are IDs only and the client refetches over tRPC, so
        // nothing identifying crosses this channel.
        const { client } = api;
        const { branch, patient } = await clinicViaApi();

        const { events } = await captureWsEvents(api.wsUrl, async () => {
            const appointment = await client.appointment.create.mutate({
                patient: { kind: 'existing', patientId: patient.id },
                branchId: branch.id,
                startsAt: slot(),
            });
            const visit = await client.visit.checkIn.mutate({ appointmentId: appointment.id });
            await client.visit.checkOut.mutate({
                visitId: visit.id,
                chargedTotal: 100_000,
                paidTotal: 100_000,
                method: 'cash',
            });
        });

        expect(events.length).toBeGreaterThan(0);
        const serialized = JSON.stringify(events);
        expect(serialized).not.toContain('Nadia');
        expect(serialized).not.toContain('201012345678');
        expect(serialized).not.toContain('100000');
        // Only `event` and `id` keys, nothing else.
        for (const event of events) {
            expect(Object.keys(event).sort()).toEqual(
                event.event === WS_EVENT.SETTINGS_UPDATED ? ['event'] : ['event', 'id'],
            );
        }
    });
});
