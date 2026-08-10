// The day view's data layer. One entry point, so swapping in the real tRPC
// client (BLOCKED.md) is this folder and nothing else.

export type { RequestError, Transport } from './client';
export { asRequestError, SERVER_URL } from './client';
export { api, rememberVisit, usingFixtures, visitForAppointment } from './day';
export type { MutationResult, QueryResult, QueryStatus } from './hooks';
export { useLocalMutation, useLocalQuery } from './hooks';
export type {
    Appointment,
    AppointmentRow,
    Branch,
    ClinicDay,
    ClinicSettings,
    EmbeddedPatient,
    Patient,
    Visit,
    VisitLine,
    VisitPayment,
    VisitRow,
    WalkInResult,
} from './types';
