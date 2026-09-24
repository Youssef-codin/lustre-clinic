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

/** Rejects when nothing could open the link. */
export async function openWhatsApp(url: string, branchApp: WhatsAppApp): Promise<void> {
    const target = whatsAppTarget(installedWhatsApp(), branchApp);
    if (typeof target === 'object' && openInPackage(url, target.package)) return;
    await Linking.openURL(url);
}
