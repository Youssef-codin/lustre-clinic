import type { PrintFailure, PrintQueued } from '@mawid/shared';
import { useMemo, useState } from 'react';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { useServerEvent } from '../contexts/SocketContext.tsx';
import { api } from '../lib/api.ts';
import { formatClinicDate } from '../lib/datetime.ts';
import { localizeError } from '../lib/errorMessage.ts';

/**
 * "A silent failure to print is worse than no printing. Loud is the
 * requirement" (spec §7). This is the loud part: the paper the clinic actually
 * runs on did not come out, and the secretary has to know before the patient
 * has left the desk.
 *
 * Failures arrive two ways and are treated identically — pushed live on
 * `print:failed`, and fetched with the route so a failure that happened while
 * the desk was reloading is not invisible. Deduped by `id`.
 */
export function PrintFailureBanner({ fetched }: { fetched: PrintFailure[] }) {
    const { locale, t } = useI18n();
    const [live, setLive] = useState<PrintFailure[]>([]);
    const [dismissed, setDismissed] = useState<string[]>([]);
    const [retrying, setRetrying] = useState<string | null>(null);
    const [retryError, setRetryError] = useState<unknown>(null);

    useServerEvent('print:failed', (failure) => {
        setLive((current) => (current.some((f) => f.id === failure.id) ? current : [failure, ...current]));
    });

    const failures = useMemo(() => {
        const byId = new Map<string, PrintFailure>();
        for (const failure of [...live, ...fetched]) byId.set(failure.id, failure);

        return [...byId.values()]
            .filter((failure) => !dismissed.includes(failure.id))
            .sort((a, b) => b.failedAt.localeCompare(a.failedAt));
    }, [live, fetched, dismissed]);

    const retry = async (failure: PrintFailure) => {
        setRetrying(failure.id);
        setRetryError(null);
        try {
            const path =
                failure.kind === 'slip'
                    ? `/api/print/slip/${failure.appointmentId}`
                    : `/api/print/day?date=${failure.date}`;
            await api.post<PrintQueued>(path);

            // Queued, so this row is spent. If it fails again the server sends a
            // fresh `print:failed` carrying a new id.
            setDismissed((current) => [...current, failure.id]);
        } catch (err: unknown) {
            setRetryError(err);
        } finally {
            setRetrying(null);
        }
    };

    if (failures.length === 0) return null;

    return (
        <section
            role="alert"
            className="mb-6 rounded-lg border border-rose-300 bg-rose-50 p-4"
            aria-labelledby="print-failures-heading"
        >
            <h2 id="print-failures-heading" className="mb-3 font-semibold text-rose-900">
                {t('print.failedHeading')}
            </h2>

            <ul className="grid gap-2">
                {failures.map((failure) => (
                    <li
                        key={failure.id}
                        className="flex flex-wrap items-center gap-3 rounded-md bg-white px-3 py-2.5"
                    >
                        <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900">
                                {failure.kind === 'slip'
                                    ? t('print.slipJob', { id: failure.appointmentId })
                                    : t('print.dayJob', { date: formatClinicDate(failure.date, locale) })}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500">
                                {t('print.driver', { driver: failure.driver })} ·{' '}
                                {t('print.attempts', { attempts: failure.attempts })}
                            </p>
                            {/* Driver text, deliberately untranslated: it is what
                                you would type into a search engine. */}
                            <p className="mt-0.5 truncate font-mono text-xs text-slate-400" dir="ltr">
                                {failure.error}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => retry(failure)}
                            disabled={retrying === failure.id}
                            className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:bg-slate-300"
                        >
                            {retrying === failure.id ? t('print.retrying') : t('print.retry')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setDismissed((current) => [...current, failure.id])}
                            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                            {t('common.dismiss')}
                        </button>
                    </li>
                ))}
            </ul>

            {retryError != null && (
                <p className="mt-3 text-sm text-rose-800">
                    {t('print.retryFailed', { message: localizeError(t, retryError) })}
                </p>
            )}
        </section>
    );
}
