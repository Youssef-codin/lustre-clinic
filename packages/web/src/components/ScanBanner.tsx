import { useI18n } from '../contexts/LocaleContext.tsx';
import { useScan } from '../contexts/ScanContext.tsx';

/**
 * Shown only when a scan arrived while the desk was mid-edit. The normal path
 * navigates straight to the patient and never renders this.
 */
export function ScanBanner() {
    const { held, open, dismiss } = useScan();
    const { t } = useI18n();

    if (!held) return null;

    return (
        /*
         * Above the booking sheet's backdrop (z-40) and the sheet itself (z-50).
         * A scan is only ever held because the sheet is open, so a banner that
         * sat underneath it would be visible and un-clickable — which reads as
         * broken. Opening from here abandons the booking, deliberately.
         */
        <div
            role="status"
            className="relative z-[60] mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 shadow-lg"
        >
            <span className="rounded-full bg-sky-600 px-2.5 py-1 text-xs font-medium text-white">
                {t('scan.label')}
            </span>

            <span className="min-w-0 flex-1 truncate text-slate-800">
                {held.name ? t('scan.withName', { name: held.name }) : t('scan.withoutName')}
            </span>

            <button
                type="button"
                onClick={open}
                className="h-10 rounded-lg bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700"
            >
                {t('scan.open')}
            </button>
            <button
                type="button"
                onClick={dismiss}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
                {t('common.dismiss')}
            </button>
        </div>
    );
}
