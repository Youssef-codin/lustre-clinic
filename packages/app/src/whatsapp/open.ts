import type { WhatsAppApp } from '@lustre/shared';
import { Linking } from 'react-native';
import { isInstalled, openInPackage } from '../../modules/lustre-whatsapp';
import { type InstalledWhatsApp, WHATSAPP_PACKAGE, whatsAppTarget } from './target';

/** Read at tap time, never cached: either app can be installed or removed while this one runs. */
export function installedWhatsApp(): InstalledWhatsApp {
    return {
        regular: isInstalled(WHATSAPP_PACKAGE.regular),
        business: isInstalled(WHATSAPP_PACKAGE.business),
    };
}

/**
 * Rejects when nothing could open the link. `branchApp` is optional because a
 * server older than the per-branch setting sends none, and a missing package
 * name made the native call throw before Android was asked anything.
 */
export async function openWhatsApp(url: string, branchApp: WhatsAppApp | null | undefined): Promise<void> {
    const target = whatsAppTarget(installedWhatsApp(), branchApp ?? 'regular');
    if (typeof target === 'object' && openInPackage(url, target.package)) return;
    await Linking.openURL(url);
}
