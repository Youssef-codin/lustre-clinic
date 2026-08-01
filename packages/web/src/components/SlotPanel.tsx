import { appointmentTypeLabel, type OpenSlot, type SlotsResponse } from '@mawid/shared';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { formatClinicTime } from '../lib/datetime.ts';

interface SlotPanelProps {
    typeId: string;
    onTypeChange: (typeId: string) => void;
    slots: SlotsResponse;
    onPick: (slot: OpenSlot) => void;
}

/**
 * Picking *when* happens here; picking *who* happens in the sheet this opens.
 * Splitting them keeps the day view on screen while the secretary scans for a
 * time, which is the part she does with a patient waiting in front of her.
 */
export function SlotPanel({ typeId, onTypeChange, slots, onPick }: SlotPanelProps) {
    const { config } = useConfig();
    const { locale, t } = useI18n();

    return (
        <section className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">{t('book.heading')}</h2>

            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="appointment-type">
                {t('book.type')}
            </label>
            <select
                id="appointment-type"
                value={typeId}
                onChange={(event) => onTypeChange(event.target.value)}
                className="mb-5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm"
            >
                {config?.appointmentTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                        {appointmentTypeLabel(type, locale)} ·{' '}
                        {t('appointmentTypes.minutes', { minutes: type.minutes })}
                    </option>
                ))}
            </select>

            <h3 className="mb-2 text-sm font-medium text-slate-700">{t('book.slots')}</h3>

            {slots.slots.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">{t('book.noSlots')}</p>
            ) : (
                <div className="grid grid-cols-3 gap-2">
                    {slots.slots.map((slot) => (
                        <button
                            key={slot.startsAt}
                            type="button"
                            onClick={() => onPick(slot)}
                            className="h-11 rounded-lg border border-slate-300 bg-white font-mono text-base tabular-nums text-slate-900 shadow-sm transition hover:border-sky-400 hover:bg-sky-50 active:bg-sky-100"
                        >
                            {config ? formatClinicTime(slot.startsAt, config.clinic.timezone, locale) : ''}
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
