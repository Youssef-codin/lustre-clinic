import { clinicName } from '@mawid/shared';
import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { LocaleToggle } from '../components/LocaleToggle.tsx';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { localizeError } from '../lib/errorMessage.ts';

/**
 * The shell every route renders inside: clinic identity, the locale toggle, and
 * anything that must stay visible while navigating. Layout uses logical
 * properties throughout so it mirrors correctly when `dir` flips — see spec §2.
 */
function RootLayout() {
    const { config, error } = useConfig();
    const { locale, t } = useI18n();

    const title = config ? clinicName(config.clinic, locale) : t('app.name');
    const subtitle = config ? clinicName(config.clinic, locale === 'ar' ? 'en' : 'ar') : null;

    return (
        <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-8 sm:px-6">
            <header className="mb-8 flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
                {/* The doctor arrives on /p/:id from a scanned slip; this is his way back. */}
                <Link to="/" className="rounded-md focus-visible:outline-2 focus-visible:outline-sky-600">
                    <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
                    {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
                </Link>
                <LocaleToggle />
            </header>

            {error && (
                <p className="mb-6 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {t('config.loadFailed', { message: localizeError(t, error) })}
                </p>
            )}

            <Outlet />
        </main>
    );
}

function NotFound() {
    const { t } = useI18n();

    return (
        <section className="py-8 text-center">
            <h2 className="mb-2 text-lg font-semibold">{t('notFound.heading')}</h2>
            <p className="mb-6 text-slate-500">{t('notFound.body')}</p>
            <Link to="/" className="font-medium text-sky-700 underline underline-offset-4">
                {t('notFound.back')}
            </Link>
        </section>
    );
}

export const rootRoute = createRootRoute({
    component: RootLayout,
    notFoundComponent: NotFound,
});
