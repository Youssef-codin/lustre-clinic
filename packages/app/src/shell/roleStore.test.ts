/**
 * The role decides which day screen and which Settings rows a handset draws, so
 * a launch that forgets it is a secretary's phone opening on the doctor's view
 * of the clinic. A store built fresh against seeded storage is what a cold
 * start actually does.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test';

const stored = new Map<string, string>();
let readFails = false;
let writeFails = false;

mock.module('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: (key: string) =>
            readFails ? Promise.reject(new Error('storage')) : Promise.resolve(stored.get(key) ?? null),
        setItem: (key: string, value: string) =>
            writeFails ? Promise.reject(new Error('storage')) : Promise.resolve(void stored.set(key, value)),
        removeItem: (key: string) => Promise.resolve(void stored.delete(key)),
    },
}));

const { createRoleStore, resolveRole } = await import('./roleStore');

/** A cold launch: a store that has never read storage, subscribed to as the shell subscribes. */
async function launch() {
    const store = createRoleStore();
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getSnapshot().role));
    await Promise.resolve();
    await Promise.resolve();
    return { store, seen };
}

beforeEach(() => {
    stored.clear();
    readFails = false;
    writeFails = false;
});

describe('the role a launch opens in', () => {
    it('holds nothing role-specific until storage has answered', () => {
        const store = createRoleStore();
        expect(store.getSnapshot().hydrated).toBe(false);
    });

    it('reopens the doctor view for a phone last used as the doctor', async () => {
        stored.set('lustre.role', 'doctor');

        const { store } = await launch();

        expect(store.getSnapshot()).toEqual({ hydrated: true, role: 'doctor' });
    });

    it('reopens the secretary view for a phone last used as the secretary', async () => {
        stored.set('lustre.role', 'secretary');

        const { store } = await launch();

        expect(store.getSnapshot()).toEqual({ hydrated: true, role: 'secretary' });
    });

    it('opens as the secretary when nothing has been stored yet', async () => {
        const { store } = await launch();

        expect(store.getSnapshot()).toEqual({ hydrated: true, role: 'secretary' });
    });

    it('opens as the secretary on a value it does not recognise', async () => {
        stored.set('lustre.role', 'Doctor ');

        const { store } = await launch();

        expect(store.getSnapshot().role).toBe('secretary');
    });

    it('opens as the secretary, hydrated, when the read throws', async () => {
        stored.set('lustre.role', 'doctor');
        readFails = true;

        const { store } = await launch();

        // Hydrated matters as much as the role: a shell that never hydrates
        // holds a blank screen forever.
        expect(store.getSnapshot()).toEqual({ hydrated: true, role: 'secretary' });
    });

    it('never passes through the doctor view on its way to the secretary', async () => {
        const { seen } = await launch();

        expect(seen).not.toContain('doctor');
    });
});

describe('a provisioned phone', () => {
    const legacy = { hydrated: true, role: 'secretary' as const };
    const credential = { token: 't', deviceId: 'd', role: 'admin' as const, label: 'Owner' };

    it('draws the view of the role it was granted, whatever it was left on', () => {
        expect(resolveRole(legacy, credential, true)).toEqual({
            hydrated: true,
            role: 'doctor',
            granted: 'admin',
        });
    });

    it('keeps the view it was left on until it scans a code', () => {
        expect(resolveRole(legacy, null, true)).toEqual({ hydrated: true, role: 'secretary', granted: null });
    });

    it('holds nothing role-specific until the credential has been read too', () => {
        expect(resolveRole(legacy, null, false).hydrated).toBe(false);
    });
});
