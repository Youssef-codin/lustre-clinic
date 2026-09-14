/**
 * The Done-when of the crash-report task: a report taken on the patient list
 * and on a visit contains no name, phone, note or amount anywhere in the event
 * JSON.
 *
 * This runs the real SDK pipeline, not the filter on its own. `@sentry/core` is
 * the core `@sentry/react-native` is built on, at the same version: scope data
 * is merged, `beforeBreadcrumb` and `beforeSend` run as they do on the phone,
 * and the envelope a transport would put on the wire is parsed back and
 * searched. The breadcrumbs going in have the shapes the SDK itself records (a
 * tap from `TouchEventBoundary`, an XHR with its full URL, a console call),
 * plus the ones `trail.ts` builds. The tRPC URLs come from a real
 * `httpBatchLink`, so the input a query puts in its query string is the real
 * encoding.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import type { AppRouter } from '@lustre/server/src/trpc/router.ts';
import {
    addBreadcrumb,
    type Breadcrumb,
    Client,
    type ClientOptions,
    captureException,
    captureMessage,
    createStackParser,
    createTransport,
    type Event,
    exceptionFromError,
    getCurrentScope,
    getIsolationScope,
    nodeStackLineParser,
    parseEnvelope,
    resolvedSyncPromise,
    setCurrentClient,
} from '@sentry/core';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { allowBreadcrumb, allowEvent, PROBLEM_REPORT } from './privacy';
import { apiCrumb, connectionCrumb, lifecycleCrumb, screenCrumb, screenName } from './trail';

const PATIENT = {
    id: '0199a3c2-7d4e-7b21-9f00-3c5a1e2b4d6f',
    name: 'Mariam Saeed Farouk',
    arabicName: 'مريم سعيد فاروق',
    phone: '+201001234567',
    localPhone: '01001234567',
    note: 'allergic to penicillin',
    // Piastres, and the pounds a screen would draw for them.
    amount: 987654,
    amountShown: '9,876.54',
};

const VISIT = {
    appointmentId: '0199a3c2-8a10-7c33-8e11-5b6a7c8d9e0f',
    visitId: '0199a3c2-8b20-7d44-9f22-6c7b8d9e0f1a',
};

const FORBIDDEN = [
    PATIENT.name,
    'Mariam',
    'Farouk',
    PATIENT.arabicName,
    PATIENT.phone,
    PATIENT.localPhone,
    '1234567',
    PATIENT.note,
    'penicillin',
    String(PATIENT.amount),
    PATIENT.amountShown,
];

const stackParser = createStackParser(nodeStackLineParser());

class TestClient extends Client<ClientOptions> {
    // biome-ignore lint/complexity/noUselessConstructor: `Client`'s constructor is protected
    constructor(options: ClientOptions) {
        super(options);
    }

    eventFromException(exception: unknown): PromiseLike<Event> {
        const error = exception instanceof Error ? exception : new Error(String(exception));
        return resolvedSyncPromise({ exception: { values: [exceptionFromError(stackParser, error)] } });
    }

    eventFromMessage(message: unknown): PromiseLike<Event> {
        return resolvedSyncPromise({ message: String(message), level: 'info' });
    }
}

let sent: string[] = [];
let client: TestClient;

beforeEach(() => {
    sent = [];
    getCurrentScope().clear();
    getIsolationScope().clear();
    client = new TestClient({
        dsn: 'http://public@glitchtip.test:8000/1',
        integrations: [],
        stackParser,
        sendDefaultPii: false,
        maxBreadcrumbs: 100,
        beforeBreadcrumb: allowBreadcrumb,
        beforeSend: allowEvent,
        transport: (options) =>
            createTransport(options, async (request) => {
                sent.push(
                    typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body),
                );
                return { statusCode: 200 };
            }),
    });
    setCurrentClient(client);
    client.init();
});

/** Every event the transport was handed, as the JSON that would reach GlitchTip. */
async function eventsSent(): Promise<string[]> {
    await client.flush(1000);
    return sent.flatMap((body) =>
        parseEnvelope(body)[1]
            .filter(([header]) => header.type === 'event')
            .map(([, payload]) => JSON.stringify(payload)),
    );
}

function expectNoPatientData(json: string) {
    for (const value of FORBIDDEN) expect(json).not.toContain(value);
}

/** The URLs a real batch link builds for these calls. */
async function trpcUrls(call: (trpc: ReturnType<typeof createTRPCClient<AppRouter>>) => Promise<unknown>[]) {
    const urls: string[] = [];
    const trpc = createTRPCClient<AppRouter>({
        links: [
            httpBatchLink({
                url: 'http://smilemakers.tailad17f9.ts.net:3000/trpc',
                fetch: async (url) => {
                    urls.push(String(url));
                    return new Response('[]', { status: 500 });
                },
            }),
        ],
    });
    await Promise.allSettled(call(trpc));
    return urls;
}

/** A tap as `TouchEventBoundary` logs it with `labelName: 'testID'`, innermost first. */
function touch(path: { name?: string; label?: string; file?: string }[]): Breadcrumb {
    const label = path.find((entry) => entry.label)?.label;
    return {
        category: 'touch',
        type: 'user',
        level: 'info',
        message: `Touch event within element: ${label ?? path[0]?.name}`,
        data: { path },
    };
}

function xhr(url: string, method: 'GET' | 'POST', body?: string): Breadcrumb {
    return {
        category: 'xhr',
        type: 'http',
        data: { method, url, status_code: 500, request_body_size: body?.length },
    };
}

describe('a report taken on the patient list', () => {
    it('carries the trail and no patient data anywhere in the event', async () => {
        const [searchUrl = ''] = await trpcUrls((trpc) => [
            trpc.patient.search.query({ q: `${PATIENT.name} ${PATIENT.localPhone}` }),
            trpc.balance.outstanding.query(),
        ]);
        expect(searchUrl).toContain('input=');
        expect(decodeURIComponent(searchUrl)).toContain(PATIENT.name);

        addBreadcrumb(screenCrumb(screenName('patients')));
        addBreadcrumb(lifecycleCrumb('background'));
        addBreadcrumb(lifecycleCrumb('active'));
        addBreadcrumb(connectionCrumb('online'));
        addBreadcrumb(xhr(searchUrl, 'GET'));
        addBreadcrumb(apiCrumb(new URL(searchUrl).pathname, 200, 143.6));
        addBreadcrumb(
            touch([
                { name: 'View', label: `patient-row-${PATIENT.id}` },
                { name: 'Pressable', label: `patient-row-${PATIENT.id}` },
                { name: 'PatientRow', file: 'src/components/domain/PatientRow.tsx' },
                { name: 'PatientListScreen' },
            ]),
        );
        // A label that is visible text, the way `sentry-label` or a careless testID would carry it.
        addBreadcrumb(touch([{ name: 'Text', label: PATIENT.name }, { name: 'PatientRow' }]));
        addBreadcrumb({
            category: 'console',
            level: 'log',
            message: JSON.stringify(PATIENT),
            data: { arguments: [PATIENT] },
        });
        addBreadcrumb({ category: 'navigation', data: { to: PATIENT.name, from: 'patients' } });

        getCurrentScope().setUser({ username: PATIENT.name, phone: PATIENT.phone });
        getCurrentScope().setExtra('patient', PATIENT);
        getCurrentScope().setTag('patient', PATIENT.name);
        getCurrentScope().setTag('role', 'secretary');
        getCurrentScope().setContext('device', { name: `${PATIENT.name}'s phone`, model: 'SM-A546E' });

        captureException(new TypeError(`Cannot read property 'balance' of ${PATIENT.name} ${PATIENT.phone}`));

        const [json = ''] = await eventsSent();
        expectNoPatientData(json);

        const event = JSON.parse(json) as Event;
        expect(event.exception?.values?.[0]?.type).toBe('TypeError');
        expect(event.tags).toEqual({ role: 'secretary' });
        expect(event.user).toBeUndefined();
        expect(event.extra).toBeUndefined();
        expect(event.contexts).toEqual({ device: { model: 'SM-A546E' } });
        expect(event.breadcrumbs?.map((crumb) => [crumb.category, crumb.data])).toEqual([
            ['navigation', { to: 'patients' }],
            ['app.lifecycle', { state: 'background' }],
            ['app.lifecycle', { state: 'active' }],
            ['connection', { status: 'online' }],
            ['api', { procedures: ['patient.search', 'balance.outstanding'], status: 200, ms: 144 }],
            [
                'ui.tap',
                {
                    target: `patient-row-${PATIENT.id}`,
                    within: ['View', 'Pressable', 'PatientRow', 'PatientListScreen'],
                },
            ],
            ['ui.tap', { within: ['Text', 'PatientRow'] }],
        ]);
    });
});

describe('a report taken on a visit', () => {
    it('carries the trail and no patient data anywhere in the event', async () => {
        const urls = await trpcUrls((trpc) => [
            trpc.visit.byId.query({ id: VISIT.visitId }),
            trpc.visit.setPrice.mutate({ visitId: VISIT.visitId, chargedTotal: PATIENT.amount }),
        ]);
        const [byIdUrl = '', setPriceUrl = ''] = urls;

        addBreadcrumb(screenCrumb(screenName('patients')));
        addBreadcrumb(screenCrumb(screenName({ name: 'record', patientId: PATIENT.id })));
        addBreadcrumb(screenCrumb(screenName({ name: 'visit', ...VISIT })));
        // A stack whose routes are records: a branch named like a person is still only data.
        addBreadcrumb(screenCrumb(screenName({ id: PATIENT.id, name: PATIENT.name })));
        addBreadcrumb(xhr(byIdUrl, 'GET'));
        addBreadcrumb(apiCrumb(new URL(byIdUrl).pathname, 200, 88));
        addBreadcrumb(xhr(setPriceUrl, 'POST', JSON.stringify({ chargedTotal: PATIENT.amount })));
        addBreadcrumb(apiCrumb(new URL(setPriceUrl).pathname, 500, 5_012));
        addBreadcrumb(touch([{ name: 'Text', label: PATIENT.note }, { name: 'ProcedureLine' }]));
        addBreadcrumb(
            touch([{ name: 'View', label: 'visit-confirm' }, { name: 'Button' }, { name: 'VisitScreen' }]),
        );

        getCurrentScope().setExtras({ note: PATIENT.note, chargedTotal: PATIENT.amount });
        getCurrentScope().setContext('visit', { ...VISIT, note: PATIENT.note, total: PATIENT.amountShown });
        getCurrentScope().setTags({
            procedure: 'visit.setPrice',
            error_code: 'INTERNAL',
            amount: PATIENT.amount,
        });

        const error = new Error(
            `checkout failed for ${PATIENT.name}: ${PATIENT.amountShown} (${PATIENT.note})`,
        );
        captureException(error, {
            tags: { boundary: 'patients' },
            contexts: {
                react: {
                    componentStack:
                        '\n    in VisitScreen (at PatientsCluster.tsx:190)\n    in PatientsCluster',
                },
            },
        });

        const [json = ''] = await eventsSent();
        expectNoPatientData(json);

        const event = JSON.parse(json) as Event;
        expect(event.exception?.values?.[0]).toMatchObject({ type: 'Error' });
        expect(event.exception?.values?.[0]?.value).toBeUndefined();
        expect(event.exception?.values?.[0]?.stacktrace?.frames?.length).toBeGreaterThan(0);
        expect(event.tags).toEqual({
            procedure: 'visit.setPrice',
            error_code: 'INTERNAL',
            boundary: 'patients',
        });
        expect(event.contexts).toEqual({
            react: {
                componentStack: '\n    in VisitScreen (at PatientsCluster.tsx:190)\n    in PatientsCluster',
            },
        });
        expect(event.breadcrumbs?.map((crumb) => [crumb.category, crumb.data])).toEqual([
            ['navigation', { to: 'patients' }],
            ['navigation', { to: 'record' }],
            ['navigation', { to: 'visit' }],
            ['api', { procedures: ['visit.byId'], status: 200, ms: 88 }],
            ['api', { procedures: ['visit.setPrice'], status: 500, ms: 5012 }],
            ['ui.tap', { within: ['Text', 'ProcedureLine'] }],
            ['ui.tap', { target: 'visit-confirm', within: ['View', 'Button', 'VisitScreen'] }],
        ]);
    });
});

describe('"Report a problem"', () => {
    it('sends the trail without a crash', async () => {
        addBreadcrumb(screenCrumb('settings'));
        addBreadcrumb(touch([{ name: 'Pressable', label: 'settings-report-problem' }]));
        captureMessage(PROBLEM_REPORT, { level: 'info', tags: { report: 'problem' } });

        const [json = ''] = await eventsSent();
        const event = JSON.parse(json) as Event;
        expect(event.message).toBe(PROBLEM_REPORT);
        expect(event.tags).toEqual({ report: 'problem' });
        expect(event.breadcrumbs?.map((crumb) => crumb.category)).toEqual(['navigation', 'ui.tap']);
    });

    it('sends nothing for any other message, since a message can say anything', async () => {
        addBreadcrumb(screenCrumb('patients'));
        captureMessage(`${PATIENT.name} could not be found`);
        expect(await eventsSent()).toEqual([]);
    });
});

describe('allowBreadcrumb', () => {
    it('passes its own output unchanged, so the second pass in beforeSend keeps what the first kept', () => {
        const crumbs = [
            screenCrumb('booking'),
            apiCrumb('/trpc/appointment.byDate,settings.get', 200, 40),
            apiCrumb('/trpc/visit.checkOut', null, 5000),
            touch([{ name: 'View', label: 'visit-send-to-desk' }, { name: 'Button' }]),
            lifecycleCrumb('inactive'),
            connectionCrumb('offline'),
        ];
        for (const crumb of crumbs) {
            const once = allowBreadcrumb({ ...crumb, timestamp: 1_757_870_000 });
            expect(once).not.toBeNull();
            expect(allowBreadcrumb(once as Breadcrumb)).toEqual(once);
        }
    });

    it('drops every category it does not know', () => {
        for (const category of [
            'console',
            'xhr',
            'fetch',
            'sentry.event',
            'ui.click',
            'redux.action',
            undefined,
        ]) {
            expect(
                allowBreadcrumb({ category, message: PATIENT.name, data: { value: PATIENT.phone } }),
            ).toBeNull();
        }
    });
});
