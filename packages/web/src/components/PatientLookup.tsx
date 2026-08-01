import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { usePatientSearch } from '../hooks/usePatientSearch.ts';
import { localizeError } from '../lib/errorMessage.ts';

/**
 * Look a patient up by name or phone and open their history.
 *
 * The same search exists inside `PatientPicker`, but only once a slot has been
 * clicked — that one is a step in booking. This is the standalone entry point:
 * the patient on the phone asking when their appointment is, or standing at the
 * desk having lost their slip. Without it the only routes to `/p/:id` are
 * scanning a QR code or already having an appointment today, and the secretary's
 * workaround is to start a booking she has to remember to abandon.
 *
 * Results link rather than select. Nothing here mutates anything, so a misspelt
 * search costs a keystroke.
 */
export function PatientLookup() {
    const { t } = useI18n();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const { results, error, searching } = usePatientSearch(query);
    const container = useRef<HTMLDivElement>(null);

    // Clicking a result navigates and unmounts this anyway; this is for the
    // click that lands anywhere else, which should put the desk back.
    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: PointerEvent) => {
            if (!container.current?.contains(event.target as Node)) setOpen(false);
        };

        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const trimmed = query.trim();
    const showPanel = open && trimmed !== '';

    return (
        <div ref={container} className="relative mb-4">
            <label className="sr-only" htmlFor="patient-lookup">
                {t('lookup.label')}
            </label>
            <input
                id="patient-lookup"
                type="search"
                autoComplete="off"
                value={query}
                placeholder={t('lookup.placeholder')}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        setQuery('');
                        setOpen(false);
                    }
                }}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 sm:max-w-md"
            />

            {showPanel && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg sm:max-w-md">
                    {error != null && (
                        <p className="px-3 py-2.5 text-sm text-rose-700">{localizeError(t, error)}</p>
                    )}

                    {error == null && searching && (
                        <p className="px-3 py-2.5 text-sm text-slate-500">{t('lookup.searching')}</p>
                    )}

                    {error == null && !searching && results.length === 0 && (
                        <p className="px-3 py-2.5 text-sm text-slate-500">{t('lookup.noResults')}</p>
                    )}

                    {error == null && results.length > 0 && (
                        <ul className="max-h-72 divide-y divide-slate-200 overflow-y-auto">
                            {results.map((patient) => (
                                <li key={patient.id}>
                                    <Link
                                        to="/p/$patientId"
                                        params={{ patientId: patient.id }}
                                        onClick={() => setOpen(false)}
                                        className="flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-slate-50"
                                    >
                                        <span className="truncate font-medium text-slate-900">
                                            {patient.name}
                                        </span>
                                        <span className="shrink-0 font-mono text-sm text-slate-500" dir="ltr">
                                            {patient.phone}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
