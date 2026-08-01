import type { ComponentStatus, HealthResponse } from '@mawid/shared';
import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { useSocket } from '../contexts/SocketContext.tsx';
import type { TranslationKey } from '../i18n/index.ts';
import { api } from '../lib/api.ts';

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

function Pill({ label, status }: { label: string; status: ComponentStatus }) {
    const { t } = useI18n();

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
        >
            {label}
            <span className="opacity-70">·</span>
            {t(STATUS_KEY[status])}
        </span>
    );
}

/**
 * Compact by design, but never hidden: a silent failure here means a patient is
 * not told and nobody finds out until they do not show up (spec §15).
 */
export function SystemStatus() {
    const { connected } = useSocket();
    const { t } = useI18n();
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

    return (
        <div className="mb-6 flex flex-wrap items-center gap-2">
            <Pill label={t('status.socket')} status={connected ? 'ok' : 'down'} />
            <Pill label={t('status.db')} status={health?.db ?? 'down'} />
            <Pill label={t('status.printer')} status={health?.printer ?? 'down'} />
            <Pill label={t('status.whatsapp')} status={health?.whatsapp ?? 'down'} />
        </div>
    );
}
