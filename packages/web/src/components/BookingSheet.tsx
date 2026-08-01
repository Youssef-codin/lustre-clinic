import {
    type AppointmentWithPatient,
    appointmentTypeLabel,
    type CreateAppointmentBody,
    type IsoDate,
    type OpenSlot,
} from '@mawid/shared';
import { useEffect, useRef, useState } from 'react';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { api } from '../lib/api.ts';
import { formatClinicDate, formatClinicTime } from '../lib/datetime.ts';
import { localizeError } from '../lib/errorMessage.ts';
import { EMPTY_CHOICE, type PatientChoice, PatientPicker } from './PatientPicker.tsx';

interface BookingSheetProps {
    date: IsoDate;
    slot: OpenSlot;
    typeId: string;
    durationMin: number;
    onClose: () => void;
    onBooked: (appointment: AppointmentWithPatient) => void;
}

function isComplete(choice: PatientChoice): boolean {
    return choice.mode === 'existing'
        ? choice.patient !== null
        : choice.name.trim().length >= 2 && choice.phone.trim().length >= 6;
}

/**
 * Slides over the day view rather than replacing it: the secretary keeps the
 * day on screen while she confirms, and one Escape puts her back.
 */
export function BookingSheet({ date, slot, typeId, durationMin, onClose, onBooked }: BookingSheetProps) {
    const { config } = useConfig();
    const { locale, t } = useI18n();
    const sheet = useRef<HTMLDivElement>(null);

    const [choice, setChoice] = useState<PatientChoice>(EMPTY_CHOICE);
    const [note, setNote] = useState('');
    const [error, setError] = useState<unknown>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Straight into the patient field — this runs on every booking of the day.
    useEffect(() => {
        sheet.current?.querySelector('input')?.focus();
    }, []);

    const type = config?.appointmentTypes.find((candidate) => candidate.id === typeId);
    const when = config
        ? t('book.when', {
              date: formatClinicDate(date, locale),
              time: formatClinicTime(slot.startsAt, config.clinic.timezone, locale),
              duration: durationMin,
          })
        : '';

    const submit = async () => {
        if (!isComplete(choice) || saving) return;

        const trimmedNote = note.trim();
        const body: CreateAppointmentBody =
            choice.mode === 'existing'
                ? {
                      // `isComplete` has already established this.
                      patientId: (choice.patient as NonNullable<typeof choice.patient>).id,
                      startsAt: slot.startsAt,
                      typeId,
                      ...(trimmedNote ? { note: trimmedNote } : {}),
                  }
                : {
                      patient: { name: choice.name.trim(), phone: choice.phone.trim() },
                      startsAt: slot.startsAt,
                      typeId,
                      ...(trimmedNote ? { note: trimmedNote } : {}),
                  };

        setSaving(true);
        setError(null);
        try {
            onBooked(await api.post<AppointmentWithPatient>('/api/appointments', body));
        } catch (err: unknown) {
            setError(err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            {/* Dismissing by clicking away is a mouse affordance; Escape and the
                Cancel button are the keyboard and touch equivalents. */}
            <div className="fixed inset-0 z-40 bg-slate-900/40" aria-hidden="true" onClick={onClose} />

            <div
                ref={sheet}
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-title"
                className="fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl"
            >
                <header className="border-b border-slate-200 px-5 py-4">
                    <h2 id="booking-title" className="text-lg font-semibold">
                        {t('book.sheetTitle')}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">{when}</p>
                    {type && (
                        <p className="mt-0.5 text-sm text-slate-500">{appointmentTypeLabel(type, locale)}</p>
                    )}
                </header>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    <PatientPicker choice={choice} onChange={setChoice} />

                    <div className="mt-5">
                        <label
                            className="mb-1.5 block text-sm font-medium text-slate-700"
                            htmlFor="booking-note"
                        >
                            {t('book.noteLabel')}
                        </label>
                        <textarea
                            id="booking-note"
                            rows={3}
                            maxLength={500}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm"
                        />
                    </div>

                    {error != null && (
                        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {t('book.failed', { message: localizeError(t, error) })}
                        </p>
                    )}
                </div>

                <footer className="flex gap-3 border-t border-slate-200 px-5 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-12 flex-1 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                        {t('book.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!isComplete(choice) || saving}
                        className="h-12 flex-[2] rounded-lg bg-sky-600 font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        {saving ? t('book.confirming') : t('book.confirm')}
                    </button>
                </footer>
            </div>
        </>
    );
}
