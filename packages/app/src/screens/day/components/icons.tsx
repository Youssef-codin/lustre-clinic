/**
 * The day view's icons, built from the shared set in `components/domain/icons`
 * and named after the job each does here.
 */
import { GLYPH, icon } from '../../../components/domain';

export const PinIcon = icon(GLYPH.branch);

export const CalendarIcon = icon(GLYPH.day);

export const ClockIcon = icon(GLYPH.time);

export const ProcedureIcon = icon(GLYPH.procedure, { width: 1.8 });

export const ArrowBackIcon = icon(GLYPH.back, { width: 2.2 });

export const ArrowForwardIcon = icon(GLYPH.forward, { width: 2.2 });

export const ChatIcon = icon(GLYPH.chat);

export const CloseIcon = icon(GLYPH.close, { width: 2.2 });

export const CheckIcon = icon(GLYPH.check, { width: 2.4 });

export const WaitingIcon = icon(GLYPH.waiting, { width: 2.2 });

/** How long a booking runs. Not `WaitingIcon` — the hourglass is spoken for by
 * the patient who is waiting, and a duration is not a wait. */
export const DurationIcon = icon(GLYPH.duration);

export const PatientIcon = icon(GLYPH.patient);

/** Work out at the lab — a crown, bridge or denture the visit waits on. */
export const LabIcon = icon(GLYPH.lab, { width: 2 });

export const ChairIcon = icon(GLYPH.procedure, { width: 2 });

export const PaymentIcon = icon(GLYPH.money, { width: 2.2 });

export const PlusIcon = icon(GLYPH.add, { width: 2.4 });

/** The catalogue's remove — `CloseIcon` is a dismiss, this ends a line. */
export const XIcon = icon(GLYPH.close, { width: 2.2 });

export const MoreIcon = icon(GLYPH.more, { width: 2.2 });

export const RetryIcon = icon(GLYPH.retry, { width: 2 });

export const TrashIcon = icon(GLYPH.delete, { width: 2 });

// The appointment sheet's three actions. Cancel's calendar-with-a-cross is the
// destructive one; the no-show is the patient who did not come.
export const RescheduleIcon = icon(GLYPH.reschedule, { width: 2 });

export const NoShowIcon = icon(GLYPH.noShow, { width: 2 });

export const CancelAppointmentIcon = icon(GLYPH.cancelAppointment, { width: 2 });
