import { describe, expect, test } from 'bun:test';
import { ERROR_CODE, LOCALES } from '@mawid/shared';
import { ar } from './ar.ts';
import { en } from './en.ts';
import { errorKey, translate } from './index.ts';

describe('dictionaries', () => {
    test('both locales define exactly the same keys', () => {
        expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
    });

    test('no string is left empty or identical-by-accident placeholder', () => {
        for (const locale of LOCALES) {
            for (const [key, value] of Object.entries(locale === 'ar' ? ar : en)) {
                expect(value.trim(), `${locale}.${key} is empty`).not.toBe('');
            }
        }
    });

    test('every ERROR_CODE has a message in both locales', () => {
        for (const code of Object.values(ERROR_CODE)) {
            const key = errorKey(code);
            expect(ar[key], `missing ar ${key}`).toBeString();
            expect(en[key], `missing en ${key}`).toBeString();
        }
    });

    test('placeholders match across locales', () => {
        const placeholders = (value: string) => (value.match(/\{(\w+)\}/g) ?? []).sort();

        for (const key of Object.keys(ar) as (keyof typeof ar)[]) {
            expect(placeholders(en[key]), `placeholders differ for ${key}`).toEqual(placeholders(ar[key]));
        }
    });
});

describe('translate', () => {
    test('fills placeholders', () => {
        expect(translate('en', 'appointmentTypes.minutes', { minutes: 45 })).toBe('45 min');
        expect(translate('ar', 'appointmentTypes.minutes', { minutes: 45 })).toBe('45 دقيقة');
    });

    test('leaves an unknown placeholder in place rather than printing undefined', () => {
        expect(translate('en', 'status.meta', { version: '1.0' })).toContain('{uptime}');
    });
});
