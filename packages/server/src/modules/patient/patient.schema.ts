import {
    createPatientSchema,
    idParamSchema,
    patientSearchQuerySchema,
    updatePatientSchema,
} from '@mawid/shared';
import type { ValidationSpec } from '../../middleware/validate.ts';

/**
 * Request shapes come from `@mawid/shared` — the contract both sides build
 * against. What lives here is the per-route spec, which types the handler and
 * drives `validateSpec()` in the router from one declaration.
 */

export const searchPatientsSpec = { query: patientSearchQuerySchema } satisfies ValidationSpec;
export const getPatientSpec = { params: idParamSchema } satisfies ValidationSpec;
export const createPatientSpec = { body: createPatientSchema } satisfies ValidationSpec;
export const updatePatientSpec = {
    params: idParamSchema,
    body: updatePatientSchema,
} satisfies ValidationSpec;
