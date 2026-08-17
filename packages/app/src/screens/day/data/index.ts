/**
 * The day view's data layer — one entry point, so swapping in the real tRPC
 * client (BLOCKED.md) is this folder and nothing else.
 */
export { asRequestError, RequestError } from './client';
export type { BookedProcedure, PatientRef } from './day';
export { api, checkInTimes, rememberVisit, visitForAppointment } from './day';
export type { MutationResult, QueryResult, QueryStatus } from './hooks';
export { useLocalMutation, useLocalQuery } from './hooks';
export type {
    Appointment,
    AppointmentProcedure,
    AppointmentRow,
    Branch,
    ClinicDay,
    ClinicSettings,
    EmbeddedPatient,
    Patient,
    PendingReminder,
    ProcedureCategory,
    ProcedureRow,
    ProcedureType,
    Visit,
    VisitLine,
    VisitPayment,
    VisitRow,
    WalkInResult,
} from './types';
