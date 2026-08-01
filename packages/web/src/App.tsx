import { appointmentTypeLabel, type ComponentStatus, clinicName, type HealthResponse } from '@mawid/shared';
import { useEffect, useState } from 'react';
import { LocaleToggle } from './components/LocaleToggle.tsx';
import { useConfig } from './contexts/ConfigContext.tsx';
import { useI18n } from './contexts/LocaleContext.tsx';
import { useSocket } from './contexts/SocketContext.tsx';
import type { TranslationKey } from './i18n/index.ts';
import { api } from './lib/api.ts';
import { localizeError } from './lib/errorMessage.ts';

const STATUS_STYLES: Record<ComponentStatus, string> = {
    ok: 'bg-emerald-100 text-emerald-800',
    degraded: 'bg-amber-100 text-amber-800',
    down: 'bg-rose-100 text-rose-800',
    disabled: 'bg-slate-200 text-slate-600',
};

const STATUS_KEY: Record<ComponentStatus, TranslationKey> = {
    ok: 'status.ok',
    degraded: 'status.degraded',
    down: 'status.down',
    disabled: 'status.disabled',
};

function StatusPill({ label, status }: { label: string; status: ComponentStatus }) {
    const { t } = useI18n();

    return (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 shadow-sm">
            <span className="text-slate-700">{label}</span>
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLES[status]}`}>
                {t(STATUS_KEY[status])}
            </span>
        </div>
    );
}

export default function App() {
    const { config, error: configError } = useConfig();
    const { connected } = useSocket();
    const { locale, t } = useI18n();
    const [health, setHealth] = useState<HealthResponse | null>(null);

    useEffect(() => {
        const load = () => {
            api.get<HealthResponse>('/api/health')
                .then(setHealth)
                .catch(() => setHealth(null));
        };
        load();
        const timer = setInterval(load, 30_000);
        return () => clearInterval(timer);
    }, []);

    const title = config ? clinicName(config.clinic, locale) : t('app.name');
    const subtitle = config ? clinicName(config.clinic, locale === 'ar' ? 'en' : 'ar') : null;

    return (
        <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-8 sm:px-6">
            <header className="mb-8 flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
                <div>
                    <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
                    {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
                </div>
                <LocaleToggle />
            </header>

            {configError && (
                <p className="mb-6 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {t('config.loadFailed', { message: localizeError(t, configError) })}
                </p>
            )}

            <section className="mb-8">
                <h2 className="mb-3 text-lg font-semibold">{t('status.heading')}</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                    <StatusPill label={t('status.socket')} status={connected ? 'ok' : 'down'} />
                    <StatusPill label={t('status.db')} status={health?.db ?? 'down'} />
                    <StatusPill label={t('status.printer')} status={health?.printer ?? 'down'} />
                    <StatusPill label={t('status.whatsapp')} status={health?.whatsapp ?? 'down'} />
                </div>
                {health && (
                    <p className="mt-3 text-sm text-slate-500">
                        {t('status.meta', { version: health.version, uptime: health.uptimeSeconds })}
                    </p>
                )}
            </section>

            {config && (
                <section>
                    <h2 className="mb-3 text-lg font-semibold">{t('appointmentTypes.heading')}</h2>
                    <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg bg-white shadow-sm">
                        {config.appointmentTypes.map((type) => (
                            <li key={type.id} className="flex items-center justify-between px-4 py-3">
                                <span>{appointmentTypeLabel(type, locale)}</span>
                                <span className="text-sm text-slate-500">
                                    {t('appointmentTypes.minutes', { minutes: type.minutes })}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    );
}
