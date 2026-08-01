import type { TypedHandler } from '../../middleware/validate.ts';
import { ok, respond } from '../../util/apiresponse.ts';
import type {
    cancelAppointmentSpec,
    createAppointmentSpec,
    getAppointmentSpec,
    listDaySpec,
    updateAppointmentSpec,
} from './appointment.schema.ts';
import * as service from './appointment.service.ts';

/** HTTP only: unwrap the validated request, call the service, respond. */

export const listDay: TypedHandler<typeof listDaySpec> = async (req, res) => {
    respond(res, 200, ok(service.listDay(req.valid.query.date)));
};

export const getAppointment: TypedHandler<typeof getAppointmentSpec> = async (req, res) => {
    respond(res, 200, ok(service.getAppointment(req.valid.params.id)));
};

export const createAppointment: TypedHandler<typeof createAppointmentSpec> = async (req, res) => {
    respond(res, 201, ok(service.createAppointment(req.valid.body)));
};

export const updateAppointment: TypedHandler<typeof updateAppointmentSpec> = async (req, res) => {
    respond(res, 200, ok(service.updateAppointment(req.valid.params.id, req.valid.body)));
};

export const cancelAppointment: TypedHandler<typeof cancelAppointmentSpec> = async (req, res) => {
    respond(res, 200, ok(service.cancelAppointment(req.valid.params.id)));
};
