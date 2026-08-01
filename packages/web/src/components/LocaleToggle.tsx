import { useI18n } from '../contexts/LocaleContext.tsx';

/**
 * One button, not a dropdown — there are two languages and the desk is meant to
 * be faster than a paper book. Sized for a thumb on a tablet.
 */
export function LocaleToggle() {
    const { locale, setLocale, t } = useI18n();

    return (
        <button
            type="button"
            aria-label={t('locale.switchLabel')}
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 active:bg-slate-200"
        >
            {t('locale.switch')}
        </button>
    );
}
