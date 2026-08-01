import type { IsoDate } from '@mawid/shared';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { addDays, formatClinicDate, todayInClinic } from '../lib/datetime.ts';

/** Mirrors with direction — `rtl:rotate-180` so "previous" always points back. */
function Chevron() {
    return (
        <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-5 w-5 rtl:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 4 6 10l6 6" />
        </svg>
    );
}

const BUTTON =
    'flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 active:bg-slate-200';

export function DateNav({ date, onChange }: { date: IsoDate; onChange: (date: IsoDate) => void }) {
    const { config } = useConfig();
    const { locale, t } = useI18n();

    const today = config ? todayInClinic(config.clinic.timezone) : null;

    return (
        <div className="mb-4 flex items-center gap-3">
            <button
                type="button"
                aria-label={t('day.prev')}
                onClick={() => onChange(addDays(date, -1))}
                className={BUTTON}
            >
                <Chevron />
            </button>

            <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold">{formatClinicDate(date, locale)}</h2>
            </div>

            {today && date !== today && (
                <button
                    type="button"
                    onClick={() => onChange(today)}
                    className="h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
                >
                    {t('day.today')}
                </button>
            )}

            <button
                type="button"
                aria-label={t('day.next')}
                onClick={() => onChange(addDays(date, 1))}
                className={`${BUTTON} rotate-180`}
            >
                <Chevron />
            </button>
        </div>
    );
}
