import type { TypedHandler } from '../../middleware/validate.ts';
import { ok, respond } from '../../util/apiresponse.ts';
import type {
    createPatientSpec,
    getPatientSpec,
    searchPatientsSpec,
    updatePatientSpec,
} from './patient.schema.ts';
import * as service from './patient.service.ts';

/** HTTP only: unwrap the validated request, call the service, respond. */

export const searchPatients: TypedHandler<typeof searchPatientsSpec> = async (req, res) => {
    const { q, limit } = req.valid.query;
    respond(res, 200, ok(service.searchPatients(q, limit)));
};

export const getPatient: TypedHandler<typeof getPatientSpec> = async (req, res) => {
    respond(res, 200, ok(service.getPatientDetail(req.valid.params.id)));
};

export const createPatient: TypedHandler<typeof createPatientSpec> = async (req, res) => {
    respond(res, 201, ok(service.createPatient(req.valid.body)));
};

export const updatePatient: TypedHandler<typeof updatePatientSpec> = async (req, res) => {
    respond(res, 200, ok(service.updatePatient(req.valid.params.id, req.valid.body)));
};
