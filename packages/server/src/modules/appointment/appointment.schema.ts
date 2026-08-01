import {
    createAppointmentSchema,
    dateQuerySchema,
    idParamSchema,
    updateAppointmentSchema,
} from '@mawid/shared';
import type { ValidationSpec } from '../../middleware/validate.ts';

/**
 * Request shapes come from `@mawid/shared`. What lives here is the per-route
 * spec, which types the handler and drives `validateSpec()` in the router from
 * one declaration.
 */

export const listDaySpec = { query: dateQuerySchema } satisfies ValidationSpec;
export const getAppointmentSpec = { params: idParamSchema } satisfies ValidationSpec;
export const createAppointmentSpec = { body: createAppointmentSchema } satisfies ValidationSpec;
export const updateAppointmentSpec = {
    params: idParamSchema,
    body: updateAppointmentSchema,
} satisfies ValidationSpec;
export const cancelAppointmentSpec = { params: idParamSchema } satisfies ValidationSpec;
