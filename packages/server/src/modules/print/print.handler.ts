import type { Request, Response } from 'express';
import type { TypedHandler } from '../../middleware/validate.ts';
import { ok, respond } from '../../util/apiresponse.ts';
import type { printDaySpec, printSlipSpec } from './print.schema.ts';
import * as service from './print.service.ts';

/**
 * 202, not 201: printing is queued and nothing was created. Success means the
 * job was accepted — an actual failure arrives later on `print:failed`.
 */
export const printSlip: TypedHandler<typeof printSlipSpec> = async (req, res) => {
    respond(res, 202, ok(service.queueSlip(req.valid.params.appointmentId)));
};

export const printDay: TypedHandler<typeof printDaySpec> = async (req, res) => {
    respond(res, 202, ok(service.queueDaySchedule(req.valid.query.date)));
};

export async function listPrintFailures(_req: Request, res: Response): Promise<void> {
    respond(res, 200, ok(service.listPrintFailures()));
}
