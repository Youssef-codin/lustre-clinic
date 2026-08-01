import type { PatientSummary } from '@mawid/shared';
import { useState } from 'react';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { usePatientSearch } from '../hooks/usePatientSearch.ts';
import { localizeError } from '../lib/errorMessage.ts';

/** Mirrors the two arms of `createAppointmentSchema`. */
export type PatientChoice =
    | { mode: 'existing'; patient: PatientSummary | null }
    | { mode: 'new'; name: string; phone: string };

export const EMPTY_CHOICE: PatientChoice = { mode: 'existing', patient: null };

const FIELD =
    'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400';

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`h-11 flex-1 rounded-lg text-sm font-medium transition ${
                active ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
        >
            {children}
        </button>
    );
}

export function PatientPicker({
    choice,
    onChange,
}: {
    choice: PatientChoice;
    onChange: (choice: PatientChoice) => void;
}) {
    const { t } = useI18n();
    const [query, setQuery] = useState('');
    const { results, error, searching } = usePatientSearch(choice.mode === 'existing' ? query : '');

    return (
        <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{t('book.patient')}</span>

            <div className="mb-3 flex gap-2">
                <Segment
                    active={choice.mode === 'existing'}
                    onClick={() => onChange({ mode: 'existing', patient: null })}
                >
                    {t('book.existing')}
                </Segment>
                <Segment
                    active={choice.mode === 'new'}
                    onClick={() => onChange({ mode: 'new', name: '', phone: '' })}
                >
                    {t('book.new')}
                </Segment>
            </div>

            {choice.mode === 'existing' ? (
                <div>
                    <label className="sr-only" htmlFor="patient-search">
                        {t('book.searchLabel')}
                    </label>
                    <input
                        id="patient-search"
                        type="search"
                        autoComplete="off"
                        value={choice.patient ? choice.patient.name : query}
                        placeholder={t('book.searchPlaceholder')}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            // Typing again means the previous pick is being replaced.
                            if (choice.patient) onChange({ mode: 'existing', patient: null });
                        }}
                        className={FIELD}
                    />

                    {error != null && (
                        <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {localizeError(t, error)}
                        </p>
                    )}

                    {!choice.patient && searching && (
                        <p className="mt-2 text-sm text-slate-500">{t('book.searching')}</p>
                    )}

                    {!choice.patient && !searching && query.trim() !== '' && results.length === 0 && (
                        <p className="mt-2 text-sm text-slate-500">{t('book.noResults')}</p>
                    )}

                    {!choice.patient && results.length > 0 && (
                        <ul className="mt-2 max-h-52 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
                            {results.map((patient) => (
                                <li key={patient.id}>
                                    <button
                                        type="button"
                                        onClick={() => onChange({ mode: 'existing', patient })}
                                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start transition hover:bg-slate-50"
                                    >
                                        <span className="truncate font-medium text-slate-900">
                                            {patient.name}
                                        </span>
                                        <span className="shrink-0 font-mono text-sm text-slate-500" dir="ltr">
                                            {patient.phone}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : (
                <div className="grid gap-3">
                    <div>
                        <label className="mb-1.5 block text-sm text-slate-600" htmlFor="patient-name">
                            {t('book.nameLabel')}
                        </label>
                        <input
                            id="patient-name"
                            value={choice.name}
                            onChange={(event) => onChange({ ...choice, name: event.target.value })}
                            className={FIELD}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-sm text-slate-600" htmlFor="patient-phone">
                            {t('book.phoneLabel')}
                        </label>
                        {/* Typed as it is written in the paper book; the server normalizes to E.164. */}
                        <input
                            id="patient-phone"
                            type="tel"
                            inputMode="tel"
                            dir="ltr"
                            value={choice.phone}
                            onChange={(event) => onChange({ ...choice, phone: event.target.value })}
                            className={`${FIELD} font-mono`}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
