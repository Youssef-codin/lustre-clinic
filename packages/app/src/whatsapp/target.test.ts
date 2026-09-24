import { describe, expect, it } from 'bun:test';
import type { WhatsAppApp } from '@lustre/shared';
import { type InstalledWhatsApp, WHATSAPP_PACKAGE, type WhatsAppTarget, whatsAppTarget } from './target';

const REGULAR = { package: WHATSAPP_PACKAGE.regular };
const BUSINESS = { package: WHATSAPP_PACKAGE.business };

const cases: [string, InstalledWhatsApp, WhatsAppApp, WhatsAppTarget][] = [
    ['only WhatsApp, branch on Business', { regular: true, business: false }, 'business', REGULAR],
    ['only WhatsApp, branch on WhatsApp', { regular: true, business: false }, 'regular', REGULAR],
    ['only Business, branch on Business', { regular: false, business: true }, 'business', BUSINESS],
    ['only Business, branch on WhatsApp', { regular: false, business: true }, 'regular', BUSINESS],
    ['both, branch on Business', { regular: true, business: true }, 'business', BUSINESS],
    ['both, branch on WhatsApp', { regular: true, business: true }, 'regular', REGULAR],
    ['neither, branch on Business', { regular: false, business: false }, 'business', 'browser'],
    ['neither, branch on WhatsApp', { regular: false, business: false }, 'regular', 'browser'],
];

describe('whatsAppTarget', () => {
    for (const [name, installed, branchApp, expected] of cases) {
        it(name, () => {
            expect(whatsAppTarget(installed, branchApp)).toEqual(expected);
        });
    }
});
