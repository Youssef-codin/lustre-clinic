import { resolve } from 'node:path';
import { createApp } from '../../src/app.ts';
import { loadConfig, setConfig } from '../../src/config/index.ts';

/** The committed example is the fixture — if it drifts from the schema, tests fail. */
export const EXAMPLE_CONFIG = resolve(import.meta.dir, '../../../../config.example.json');

export function loadTestConfig() {
    return setConfig(loadConfig(EXAMPLE_CONFIG));
}

export function testApp() {
    loadTestConfig();
    return createApp();
}

/*
 * Fixed dates, chosen against `config.example.json`'s hours and Africa/Cairo,
 * which is UTC+3 in August:
 *
 *   MONDAY   2026-08-03  10:00–14:00 and 17:00–21:00 → 07:00–11:00Z, 14:00–18:00Z
 *   FRIDAY   2026-08-07  closed
 */
export const MONDAY = '2026-08-03';
export const FRIDAY = '2026-08-07';

/** 11:00 Cairo on the Monday — comfortably inside the morning window. */
export const MONDAY_11AM = '2026-08-03T08:00:00.000Z';

export function atMonday(utcTime: string): string {
    return `${MONDAY}T${utcTime}:00.000Z`;
}
