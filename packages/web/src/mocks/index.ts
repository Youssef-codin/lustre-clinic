import {
    type ApiResponse,
    createAppointmentSchema,
    createPatientSchema,
    dateQuerySchema,
    type ErrorCode,
    type FieldIssue,
    type IsoDate,
    type PatientDetail,
    type PrintFailuresResponse,
    type PrintQueued,
    type PublicConfig,
    patientSearchQuerySchema,
    printDayQuerySchema,
    printSlipParamSchema,
    slotsQuerySchema,
} from '@mawid/shared';
import { FALLBACK_CONFIG, MockStore } from './store.ts';

/**
 * A `fetch` interceptor standing in for the appointment and patient modules
 * until they exist server-side.
 *
 * It patches `fetch` rather than giving the app a second API client on purpose:
 * every component keeps calling the real relative URL (spec §2), so when the
 * server lands the only change is deleting the `installMockApi()` call — no
 * component, no hook, and no URL moves.
 *
 * Request bodies and queries are parsed with the *shared* Zod schemas, so a
 * contract change breaks this file rather than quietly diverging from it.
 */

/** Enough delay for loading states to be real during development. */
const LATENCY_MS = 140;

function json<T>(body: ApiResponse<T>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function ok<T>(data: T, status = 200): Response {
    return json<T>({ success: true, data }, status);
}

function fail(status: number, code: ErrorCode, message: string, issues?: FieldIssue[]): Response {
    return json({ success: false, error: { code, message, issues } }, status);
}

/**
 * Structural rather than `z.ZodError`: `zod` is `@mawid/shared`'s dependency,
 * and the web package should not have to take it on for one type.
 */
interface ParseFailure {
    issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}

function invalid(error: ParseFailure): Response {
    const issues: FieldIssue[] = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
    }));
    return fail(400, 'VALIDATION_FAILED', 'request failed validation', issues);
}

/** Domain errors are thrown as bare codes inside the store; map them here. */
function fromThrown(err: unknown): Response {
    const code = err instanceof Error ? err.message : 'INTERNAL';
    switch (code) {
        case 'SLOT_TAKEN':
            return fail(409, 'SLOT_TAKEN', 'that time overlaps an existing appointment');
        case 'PATIENT_NOT_FOUND':
            return fail(404, 'PATIENT_NOT_FOUND', 'no such patient');
        case 'BAD_REQUEST':
            return fail(400, 'BAD_REQUEST', 'unknown appointment type');
        default:
            return fail(500, 'INTERNAL', 'mock api failure');
    }
}

function queryObject(url: URL): Record<string, string> {
    return Object.fromEntries(url.searchParams);
}

async function handle(
    store: MockStore,
    url: URL,
    method: string,
    init?: RequestInit,
): Promise<Response | null> {
    const path = url.pathname;

    if (method === 'GET' && path === '/api/appointments') {
        const query = dateQuerySchema.safeParse(queryObject(url));
        if (!query.success) return invalid(query.error);
        return ok(store.appointmentsOn(query.data.date as IsoDate));
    }

    if (method === 'GET' && path === '/api/slots') {
        const query = slotsQuerySchema.safeParse(queryObject(url));
        if (!query.success) return invalid(query.error);
        const slots = store.slotsOn(query.data.date as IsoDate, query.data.typeId);
        return slots ? ok(slots) : fail(400, 'BAD_REQUEST', 'unknown appointment type');
    }

    if (method === 'POST' && path === '/api/appointments') {
        const body = createAppointmentSchema.safeParse(JSON.parse(String(init?.body ?? '{}')));
        if (!body.success) return invalid(body.error);

        const input = body.data;
        try {
            const patientId =
                'patientId' in input
                    ? input.patientId
                    : store.createPatient(input.patient.name, input.patient.phone, null).id;

            const appointment = store.createAppointment(
                patientId,
                input.startsAt,
                input.typeId,
                input.note ?? null,
                input.channel,
            );
            return ok(store.withPatient(appointment), 201);
        } catch (err) {
            return fromThrown(err);
        }
    }

    if (method === 'GET' && path === '/api/patients') {
        const query = patientSearchQuerySchema.safeParse(queryObject(url));
        if (!query.success) return invalid(query.error);
        return ok(store.searchPatients(query.data.q, query.data.limit));
    }

    if (method === 'POST' && path === '/api/patients') {
        const body = createPatientSchema.safeParse(JSON.parse(String(init?.body ?? '{}')));
        if (!body.success) return invalid(body.error);
        return ok(store.createPatient(body.data.name, body.data.phone, body.data.notes ?? null), 201);
    }

    if (method === 'GET' && path === '/api/print/failures') {
        return ok<PrintFailuresResponse>(store.printFailures());
    }

    if (method === 'POST' && path === '/api/print/day') {
        const query = printDayQuerySchema.safeParse(queryObject(url));
        if (!query.success) return invalid(query.error);
        return ok<PrintQueued>({ queued: true, kind: 'day' });
    }

    const slipMatch = /^\/api\/print\/slip\/(\d+)$/.exec(path);
    if (method === 'POST' && slipMatch) {
        const params = printSlipParamSchema.safeParse({ appointmentId: slipMatch[1] });
        if (!params.success) return invalid(params.error);
        if (!store.findAppointment(params.data.appointmentId)) {
            return fail(404, 'APPOINTMENT_NOT_FOUND', 'no such appointment');
        }
        return ok<PrintQueued>({ queued: true, kind: 'slip' });
    }

    const patientMatch = /^\/api\/patients\/(\d+)$/.exec(path);
    if (method === 'GET' && patientMatch) {
        const patient = store.findPatient(Number(patientMatch[1]));
        if (!patient) return fail(404, 'PATIENT_NOT_FOUND', 'no such patient');
        return ok<PatientDetail>({ patient, appointments: store.historyFor(patient.id) });
    }

    const appointmentMatch = /^\/api\/appointments\/(\d+)$/.exec(path);
    if (method === 'GET' && appointmentMatch) {
        const appointment = store.findAppointment(Number(appointmentMatch[1]));
        if (!appointment) return fail(404, 'APPOINTMENT_NOT_FOUND', 'no such appointment');
        return ok(store.withPatient(appointment));
    }

    return null;
}

export async function installMockApi(): Promise<void> {
    const original = globalThis.fetch;
    const realFetch = original.bind(globalThis);

    // The config and health modules do exist server-side, so prefer the real
    // ones and only fall back when nothing is listening — which is what makes
    // the desk screen developable with no server running at all.
    let config: PublicConfig = FALLBACK_CONFIG;
    try {
        const res = await realFetch('/api/config');
        const body = (await res.json()) as ApiResponse<PublicConfig>;
        if (body.success) config = body.data;
    } catch {
        // No server. The fallback above is sample data, never a clinic's.
    }

    const store = new MockStore(config);

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const raw = input instanceof Request ? input.url : String(input);
        const url = new URL(raw, window.location.origin);
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

        const response = await handle(store, url, method, init);
        if (!response) {
            if (url.pathname === '/api/config') return ok(config);
            return realFetch(input, init);
        }

        await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
        return response;
    };

    // `fetch` carries a `preconnect` in this typing; keep it so the replacement
    // is still structurally a `fetch`.
    globalThis.fetch = Object.assign(mockFetch, { preconnect: original.preconnect });

    console.info('[mock] appointment, patient and slot endpoints are served in-memory');
}
