/**
 * Where a WhatsApp link goes, given what this phone has installed and which app
 * the branch messages from. With one app installed the branch setting is moot —
 * that app is the only thing that can take the link.
 */
import type { WhatsAppApp } from '@lustre/shared';

export const WHATSAPP_PACKAGE = {
    regular: 'com.whatsapp',
    business: 'com.whatsapp.w4b',
} as const satisfies Record<WhatsAppApp, string>;

export type InstalledWhatsApp = Readonly<Record<WhatsAppApp, boolean>>;

/** `browser` hands the link to Android as it is: neither app is installed. */
export type WhatsAppTarget = { package: string } | 'browser';

export function whatsAppTarget(installed: InstalledWhatsApp, branchApp: WhatsAppApp): WhatsAppTarget {
    if (installed.regular && installed.business) return { package: WHATSAPP_PACKAGE[branchApp] };
    if (installed.regular) return { package: WHATSAPP_PACKAGE.regular };
    if (installed.business) return { package: WHATSAPP_PACKAGE.business };
    return 'browser';
}
