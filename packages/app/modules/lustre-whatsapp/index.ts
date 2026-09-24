/**
 * Which WhatsApp apps this phone has, and opening a link in one of them by
 * package (`android/`). Optional, because the JS can run on a native build that
 * predates it: there, nothing reads as installed and every link falls back to
 * `Linking`, which is what the app did before.
 */
import { requireOptionalNativeModule } from 'expo';

interface LustreWhatsAppNative {
    isInstalled(packageName: string): boolean;
    openInPackage(url: string, packageName: string): boolean;
}

const native = requireOptionalNativeModule<LustreWhatsAppNative>('LustreWhatsApp');

export function isInstalled(packageName: string): boolean {
    return native?.isInstalled(packageName) ?? false;
}

/** False when the package could not take the link. */
export function openInPackage(url: string, packageName: string): boolean {
    return native?.openInPackage(url, packageName) ?? false;
}
